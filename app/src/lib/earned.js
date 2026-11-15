import { useEffect, useState } from 'react'
import { listGoals, savedNim } from './goals.js'
import { readStaker } from './nimiq.js'
import { stakeEarnings } from './profileStats.js'
import { pending } from './deposit.js'
import { activeNim, earnState, leavingNim } from './earnState.js'
import { stakeGap, stakeGapExact } from './stakeGap.js'

// Savings, Profile, the goal screen and the goal cards all read rewards through this one function:
// { total, inGoals, other, earned, byGoal, since } (see profileStats.stakeEarnings), plus active (active stake, NIM)
// leaving (NIM leaving staking) and state (stopped | partial | first | earning, see earnState.js: why earned shows what it shows). earned is null when it cannot
// be computed reliably: screens hide it then. The only write is the "other stake" base kept on this device.
const BASE_KEY = 'dibs.stakeBase'
const readBase = () => { try { return JSON.parse(localStorage.getItem(BASE_KEY) || 'null') } catch { return null } }
const writeBase = (b) => { try { localStorage.setItem(BASE_KEY, JSON.stringify(b)) } catch { /* storage blocked */ } }

// A deposit waiting for the chain, or an unlock whose Remove (or Stop staking) the ledger has not caught up with.
// Exported so a restake can re-check it at the tap from a fresh staker read (components/Restake.jsx, lib/restake.js).
export function settlingNow(st, goals, address) {
  if (pending.get(address)) return true
  const inUnlock = st ? Number(st.inactiveBalance ?? 0) + Number(st.retiredBalance ?? 0) : 0
  return goals.some((g) => g.status === 'unlocking') && inUnlock === 0
}

export function stakeSummary(st, address) {
  const goals = listGoals(address)
  const base = readBase()
  const settling = settlingNow(st, goals, address)
  const r = stakeEarnings(st, goals, base, { settling })
  if (r.base && r.base !== base) writeBase(r.base)
  const unlockingNim = goals.filter((g) => g.status === 'unlocking').reduce((s, g) => s + savedNim(g), 0)
  // NIM the goals count that is not staked (null unless there is a real gap); Savings names it (lib/stakeGap.js).
  const pendingDeposit = Boolean(pending.get(address))
  const gap = stakeGap({ st, goals, settling, pendingDeposit })
  return {
    ...r,
    active: activeNim(st),
    leaving: leavingNim(st, unlockingNim), // NIM leaving staking (shown with "partial")
    state: earnState({ st, inGoals: r.inGoals, unlockingNim, earned: r.earned, since: r.since }),
    gap,
    // The same gap, not rounded: from stakeGapExact with the same arguments as gap, so the two can never disagree.
    // Savings shows it so "Total saved" and the band read as what the goals count (22,701); the whole number shown and
    // sent is Math.ceil of it (lib/restake.js wholeGap).
    gapExact: stakeGapExact({ st, goals, settling, pendingDeposit }),
  }
}

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
