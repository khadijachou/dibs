import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { getUnlockState } from '../lib/unlockFlow.js'
import { duplicateMessage, duplicateText, needsChainRead } from '../lib/duplicate.js'
import { readyTimeText } from './ReleaseClock.jsx'

// The duplicate message for `existing` (the open goal for this card), following its unlock on the chain.
export function useDuplicateText(place, existing) {
  const { t, lang, address } = useApp()
  const [us, setUs] = useState(null)
  const id = existing?.id
  const read = needsChainRead(existing)
  useEffect(() => {
    setUs(null)
    if (!id || !read) return undefined
    let live = true
    getUnlockState(existing, address).then((s) => { if (live) setUs(s) }).catch(() => { /* chain unreadable: plain message */ })
    return () => { live = false }
  }, [id, read, address]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!existing) return null
  return duplicateText(t, existing, duplicateMessage(place, existing, us), (ms) => readyTimeText(ms, lang))
}
