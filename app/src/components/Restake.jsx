import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { listGoals } from '../lib/goals.js'
import { readStaker, stakeNim } from '../lib/nimiq.js'
import { readWallet } from './ReadyState.jsx'
import { freeNimOf } from '../lib/readyState.js'
import { pending } from '../lib/deposit.js'
import { settlingNow } from '../lib/earned.js'
import { isRestake, restakeAmount, settleRestake, startRestake } from '../lib/restake.js'
import { audioContext, playDeposit } from '../lib/sound.js'
import { fmtNim } from '../lib/format.js'

// The button inside Savings' gap band: stakes the gap from the wallet onto the existing staker. One tap, one add-stake,
// no deposit recorded and no goal changed (lib/restake.js). gapExact is the figure on screen not rounded (lib/stakeGap.js
// stakeGapExact); the whole number shown and sent is Math.ceil of it, and the real amount is read again at the tap from a
// fresh staker (S2). free is the spendable wallet NIM beyond the ready goals' own NIM (lib/readyState.js freeNimOf).
// n null because the wallet has no free NIM: no button, a muted line instead.
export function RestakeButton({ gapExact }) {
  const { t, lang, address, toast } = useApp()
  const goals = listGoals(address)
  const [wallet, setWallet] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    readWallet().then((n) => { if (live && n != null) setWallet(n) })
    return () => { live = false }
  }, [address])
  // From the tap until the watcher settles the record: the button stays visible, disabled, with a small butter spinner.
  // busy covers the in-flight send in the gap band; the pending restake covers the checking band after it. Not
  // deposit_button_waiting: this says what the one tap waits on (Nimiq Pay's own confirmation).
  const waiting = busy || isRestake(pending.get(address))
  if (waiting) {
    return (
      <button type="button" className="btn restake-btn is-waiting" disabled aria-busy="true">
        <span className="btn-spin" aria-hidden="true" />{t('restake_waiting')}
      </button>
    )
  }
  if (gapExact == null) return null
  if (wallet == null) return null // still reading the wallet: no button yet
  const free = freeNimOf(wallet, goals)
  const n = restakeAmount({ gapExact, free })
  if (n == null) return <p className="small restake-none">{t('restake_none')}</p>

  const onTap = async () => {
    if (busy) return
    audioContext() // inside the tap, before any await: unlocks the sound for when it lands (as deposits do)
    setBusy(true)
    // Settling is re-checked from a fresh staker read at the tap (lib/earned.js settlingNow), never a stale screen flag.
    const settlingOf = (st) => settlingNow(st, listGoals(address), address)
    const r = await startRestake({ address, goals: listGoals(address), readStaker, readWallet, stakeNim, settlingOf })
    setBusy(false)
    if (!r.ok) { if (r.why === 'pending' || r.why === 'settling') toast(t('deposit_pending_body')); return }
    window.dispatchEvent(new Event('dibs:goals')) // Savings shows the checking state; the watcher settles it
  }
  return (
    <button type="button" className="btn restake-btn" onClick={onTap}>
      {t('restake_btn', { n: fmtNim(n, lang) })}
    </button>
  )
}

// Mounted once in App.jsx. While a restake record is in flight it settles it against the chain every 2 s (the chain is
// the only judge, as for deposits). It stops while the app is in the background and resumes when it returns, and it
// resolves a record left by a closed app on the next launch, from any screen. landed/failed: a toast, and it tells
// Savings to reload (the dibs:goals event). Renders nothing.
export function RestakeWatcher() {
  const { address, t, lang, toast, refreshBalance } = useApp()
  useEffect(() => {
    if (!address) return undefined
    let stop = false
    let running = false
    const tick = async () => {
      if (stop || running || document.visibilityState === 'hidden') return
      if (!isRestake(pending.get(address))) return
      running = true
      try {
        const r = await settleRestake({ address, readStaker, now: Date.now() })
        if (stop) return
        if (r.state === 'landed') {
          toast(t('restake_done', { n: fmtNim(r.nim, lang) }))
          playDeposit(1, 1) // the existing deposit sound (a clink)
          refreshBalance()
          window.dispatchEvent(new Event('dibs:goals'))
        } else if (r.state === 'failed') {
          toast(r.error === 'DEP_CANCELLED' ? t('err_DEP_CANCELLED_toast') : t('restake_failed'))
          window.dispatchEvent(new Event('dibs:goals'))
        }
      } finally { running = false }
    }
    const id = setInterval(tick, 2000)
    tick()
    return () => { stop = true; clearInterval(id) }
  }, [address]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
