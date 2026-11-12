import { useEffect, useState } from 'react'
import { listGoals } from './goals.js'
import { readStaker } from './nimiq.js'
import { stakeEarnings } from './profileStats.js'
import { pending } from './deposit.js'
import { activeNim, earnState } from './earnState.js'

// Savings, Profile, the goal screen and the goal cards all read rewards through this one function:
// { total, inGoals, other, earned, byGoal, since } (see profileStats.stakeEarnings), plus active (active stake, NIM)
// and state (stopped | first | earning, see earnState.js: why earned shows what it shows). earned is null when it cannot
// be computed reliably: screens hide it then. The only write is the "other stake" base kept on this device.
const BASE_KEY = 'dibs.stakeBase'
const readBase = () => { try { return JSON.parse(localStorage.getItem(BASE_KEY) || 'null') } catch { return null } }
const writeBase = (b) => { try { localStorage.setItem(BASE_KEY, JSON.stringify(b)) } catch { /* storage blocked */ } }

// A deposit waiting for the chain, or an unlock whose Remove (or Stop staking) the ledger has not caught up with.
function settlingNow(st, goals, address) {
  if (pending.get(address)) return true
  const inUnlock = st ? Number(st.inactiveBalance ?? 0) + Number(st.retiredBalance ?? 0) : 0
  return goals.some((g) => g.status === 'unlocking') && inUnlock === 0
}

export function stakeSummary(st, address) {
  const goals = listGoals(address)
  const base = readBase()
  const r = stakeEarnings(st, goals, base, { settling: settlingNow(st, goals, address) })
  if (r.base && r.base !== base) writeBase(r.base)
  return { ...r, active: activeNim(st), state: earnState({ st, inGoals: r.inGoals, earned: r.earned, since: r.since }) }
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
