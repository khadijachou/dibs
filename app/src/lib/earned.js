import { useEffect, useState } from 'react'
import { listGoals } from './goals.js'
import { readStaker } from './nimiq.js'
import { stakeEarnings } from './stats.js'

// Stake, Profile, the goal screen and the goal cards all read rewards through this one function:
// { total, earned, byGoal } (see stats.stakeEarnings). Read only.
export const stakeSummary = (st, address) => stakeEarnings(st, listGoals(address))

// The summary for screens that only display it; null while unknown (chain not read yet, or unreadable).
export function useEarned(address) {
  const [summary, setSummary] = useState(null)
  useEffect(() => {
    let live = true
    readStaker(address).then((st) => { if (live) setSummary(stakeSummary(st, address)) }).catch(() => {})
    return () => { live = false }
  }, [address])
  return summary
}
