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

// Above this yearly rate, growth of the stake is not rewards: NIM was added outside Dibs (or a deposit is not
// recorded yet). Nimiq staking pays far less; the bound only catches additions.
export const MAX_APR = 0.25
const DAY_MS = 86_400_000

// The one earned calculation (Savings "Earned so far", the goal screen, Profile, the goal cards).
// Mainnet, 10 Nov: "total staked minus goal deposits" called 1,362 NIM of stake that was active before Dibs
// "earned". So only rewards on the principal Dibs tracks (goal deposits) count:
//   extra   = total staked - NIM in goals (other stake + all rewards)
//   base    = { staker, other, at, since, carry, earned }: the other stake measured the first time Dibs read this staker
//   earned  = carry + (extra - base.other - carry) x inGoals / (inGoals + base.other)
// Anything not attributed is "Other staked NIM" (other), never earned. When the figure cannot be computed
// reliably (ledger above the chain, a deposit or a Remove not settled yet) earned is null: hide it, never guess.
// settling: a deposit or an unlock is between the chain and the ledger; the base is then never moved.
// Returns { total, inGoals, other, earned, byGoal, since, base } where base is the record to keep.
export function stakeEarnings(st, goals, base = null, { now = Date.now(), settling = false } = {}) {
  const total = st ? toNim(Number(st.balance ?? st.activeBalance ?? 0) + Number(st.inactiveBalance ?? 0) + Number(st.retiredBalance ?? 0)) : 0
  const staked = inStake(goals)
  const inGoals = staked.reduce((s, g) => s + savedNim(g), 0)
  const zero = splitEarned(0, staked)
  const unknown = (other = 0) => ({ total, inGoals, other, earned: null, byGoal: zero, since: null, base })
  if (!st) return inGoals > 0 ? unknown() : { total, inGoals, other: 0, earned: 0, byGoal: zero, since: null, base }
  const extra = total - inGoals
  if (extra < -1) return unknown() // the ledger says more than the chain holds
  const staker = st.address || null
  if (!base || base.staker !== staker) {
    if (settling) return unknown(Math.max(0, extra))
    const at = new Date(now).toISOString()
    const first = { staker, other: Math.max(0, extra), at, since: at, carry: 0, earned: 0 }
    return { total, inGoals, other: first.other, earned: 0, byGoal: zero, since: at, base: first }
  }
  // carry: what the goals had earned when the base was last moved; it sits inside extra, on top of base.other.
  let next = base
  const carry = Math.max(0, base.carry || 0)
  let fresh = extra - base.other - carry // rewards on the whole stake since base.at
  const days = Math.max(0, (now - Date.parse(base.at)) / DAY_MS)
  const maxGrowth = (inGoals + base.other) * MAX_APR * (days / 365) + 1
  if (fresh < -1 || fresh > maxGrowth) {
    // Other stake removed or added outside Dibs: keep what the goals earned so far, the rest becomes "other".
    if (settling) return unknown(Math.max(0, extra))
    const kept = Math.min(Math.max(carry, base.earned || 0), Math.max(0, extra))
    next = { ...base, other: extra - kept, carry: kept, at: new Date(now).toISOString() }
    fresh = 0
  }
  const weight = inGoals + next.other
  const earned = Math.floor((next.carry || 0) + (weight > 0 ? (Math.max(0, fresh) * inGoals) / weight : 0))
  if (next.earned !== earned) next = { ...next, earned } // the last figure shown, kept for the next move of the base
  return { total, inGoals, other: Math.max(0, total - inGoals - earned), earned, byGoal: splitEarned(earned, staked), since: next.since, base: next }
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
