import { useEffect, useState } from 'react'
import { toNim } from './config.js'
import { stakedInGoals } from './goals.js'
import { readStaker } from './nimiq.js'

// Rewards = what the staker holds beyond what the goals put in (the pool restakes rewards).
// Read only: the goal screen and the goal cards show the same figure.
export function earnedNim(st, address) {
  if (!st) return 0
  const held = toNim((st.activeBalance ?? st.balance ?? 0) + (st.inactiveBalance ?? 0))
  return Math.max(0, Math.floor(held - stakedInGoals(address)))
}

// null while unknown (chain not read yet, or unreadable).
export function useEarned(address) {
  const [earned, setEarned] = useState(null)
  useEffect(() => {
    let live = true
    readStaker(address).then((st) => { if (live) setEarned(earnedNim(st, address)) }).catch(() => {})
    return () => { live = false }
  }, [address])
  return earned
}
