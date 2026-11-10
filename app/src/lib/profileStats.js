// Profile numbers, derived only from the goal ledger already on this device. Pure: no storage, no network.
import { progress, savedNim } from './goals.js'
import { toNim } from './config.js'

// The source of More > Purchased cards: goals whose card was bought.
export const boughtGoals = (goals) => goals.filter((g) => g.status === 'redeemed')

const realDeposits = (g) => g.deposits.filter((d) => !d.kind) // not moves between goals, not returns

export function profileStats(goals) {
  const kept = goals.filter((g) => g.status !== 'withdrawn') // active and done goals
  const firstAt = goals.flatMap(realDeposits).map((d) => Date.parse(d.at)).filter(Number.isFinite).sort((a, b) => a - b)[0]
  return {
    // Lifetime: every real deposit ever made, withdrawn goals included.
    totalSaved: goals.flatMap(realDeposits).reduce((s, d) => s + d.nim, 0),
    // Done: reached 100 % (still saving, unlocking or ready) or already redeemed. A withdrawal is not done.
    goalsDone: kept.filter((g) => g.status === 'redeemed' || progress(g) >= 1).length,
    cardsBought: boughtGoals(goals).length,
    activeGoals: goals.filter((g) => g.status !== 'redeemed' && g.status !== 'withdrawn').length,
    savingSince: firstAt ? new Date(firstAt).toISOString() : null,
  }
}

// Goals whose NIM is in the staker right now (same rule as goals.stakedInGoals).
const inStake = (goals) => goals.filter((g) => (g.status === 'saving' || g.status === 'unlocking') && savedNim(g) > 0)

// The one earned calculation (Stake's "Earned so far"): everything the staker holds (active, inactive,
// retired) minus what the goals put in. byGoal splits it by each goal's share of the stake, in whole NIM,
// with largest remainders so the parts always add up to the total.
export function stakeEarnings(st, goals) {
  const total = st ? toNim(Number(st.balance ?? st.activeBalance ?? 0) + Number(st.inactiveBalance ?? 0) + Number(st.retiredBalance ?? 0)) : 0
  const staked = inStake(goals)
  const inGoals = staked.reduce((s, g) => s + savedNim(g), 0)
  const earned = Math.max(0, Math.floor(total - inGoals))
  return { total, earned, byGoal: splitEarned(earned, staked) }
}

export function splitEarned(earned, goals) {
  const out = {}
  const weight = goals.reduce((s, g) => s + savedNim(g), 0)
  if (!earned || !weight) { goals.forEach((g) => { out[g.id] = 0 }); return out }
  const parts = goals.map((g) => { const exact = (earned * savedNim(g)) / weight; return { id: g.id, n: Math.floor(exact), rest: exact - Math.floor(exact) } })
  let left = earned - parts.reduce((s, p) => s + p.n, 0)
  parts.slice().sort((a, b) => b.rest - a.rest).forEach((p) => { if (left > 0) { p.n += 1; left -= 1 } })
  parts.forEach((p) => { out[p.id] = p.n })
  return out
}
