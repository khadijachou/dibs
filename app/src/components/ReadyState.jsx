import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { listGoals } from '../lib/goals.js'
import { findItem } from '../lib/catalog.js'
import { walletNim } from '../lib/nimiq.js'
import { fmtNim } from '../lib/format.js'
import { freeNimOf, readyState } from '../lib/readyState.js'

// Spendable NIM over every shared address, read at most every 15 s for all the ready goals on screen. Read only.
let cache = { at: 0, promise: null }
function readWallet() {
  if (!cache.promise || Date.now() - cache.at > 15_000) {
    cache = { at: Date.now(), promise: walletNim().catch(() => null) }
  }
  return cache.promise
}

// The ready state of a goal (status 'ready'), or null for any other goal. Until the wallet is read (or when it
// cannot be), the header balance stands in for it.
export function useReady(goal) {
  const { address, balance, prices } = useApp()
  const isReady = goal?.status === 'ready'
  const [wallet, setWallet] = useState(null)
  useEffect(() => {
    if (!isReady) return undefined
    let live = true
    readWallet().then((n) => { if (live && n != null) setWallet(n) })
    return () => { live = false }
  }, [isReady, balance])
  if (!isReady) return null
  const free = freeNimOf(wallet ?? balance ?? 0, listGoals(address))
  return readyState(goal, findItem(goal.itemId), prices, free)
}

// The box under a ready goal's ring. compact: the one-line version on the Home card.
export function ReadyBox({ rs, compact = false }) {
  const { t, lang } = useApp()
  const v = { saved: fmtNim(rs.saved, lang), gap: fmtNim(rs.gap, lang), free: fmtNim(rs.free, lang), add: fmtNim(rs.toAdd, lang), toAdd: fmtNim(rs.toAdd, lang) }
  const key = `${compact ? 'ready_home_' : 'ready_box_'}${rs.kind}`
  const text = t(key, v) + (!compact && rs.kind !== 'covered' && rs.estimated ? ` ${t('ready_estimate')}` : '')
  return <div className={`ready-box ready-${rs.kind}${compact ? ' compact' : ''}`} role="status">{text}</div>
}
