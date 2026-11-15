// Keep it in my wallet (v1.2.11). The other answer to a Savings gap (lib/stakeGap.js): instead of staking the missing
// NIM again, the user keeps it in the wallet and picks the goal (or goals) that stop counting it. Pure maths only: no
// storage, no network, no React, no transaction. The write it drives is lib/goals.js keepInWallet (one negative 'kept'
// entry per picked goal), which lowers savedNim so the goals and the staker agree again.
//
// Insights (v1.3, not built yet) must count only deposit entries with no kind: a 'kept' entry (like 'move' and
// 'withdraw') is a ledger adjustment, never a deposit.
import { savedNim } from './goals.js'
import { rankGoals } from './goalOrder.js'

// The goals that can stop counting NIM: saving goals that hold some, in the order Savings would rank them.
export function eligible(goals = [], now = Date.now()) {
  return rankGoals(goals, { now }).filter((g) => g.status === 'saving' && savedNim(g) > 0)
}

// Adds an id at the end, or removes it when already there.
export function toggle(picked = [], id) {
  return picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
}

// The state of the pick screen. gap is the whole number the band shows (lib/restake.js wholeGap); picked is the ordered
// list of goal ids the user tapped. With exactly one eligible goal it is always the pick and cannot be unpicked.
// Returns { rows, rest, covered, total }:
//   rows: one per eligible goal { id, saved, pct, picked, give, after, pctAfter, all }. Walking the picked ids in order
//         with left = gap: give = min(saved floored to whole NIM, left); left -= give. all = the goal gives all it holds.
//         A picked goal that would give 0 (the gap is already covered) is ignored (give 0, not shown picked).
//   rest = what is still left to choose (0 when covered). covered = rest === 0. total = sum of gives.
export function pickState({ goals = [], gap = 0, picked = [], now = Date.now() } = {}) {
  const list = eligible(goals, now)
  const single = list.length === 1
  const chosen = single ? [list[0].id] : picked
  const give = {}
  let left = Math.max(0, Math.floor(gap))
  for (const id of chosen) {
    if (give[id] != null) continue // a goal tapped twice: keep the first assignment
    const g = list.find((x) => x.id === id)
    if (!g) continue
    const holds = Math.floor(savedNim(g))
    const n = Math.min(holds, left)
    give[id] = n
    left -= n
  }
  const rows = list.map((g) => {
    const saved = Math.floor(savedNim(g))
    const n = give[g.id] || 0
    const after = saved - n
    const isPicked = single || (n > 0 && chosen.includes(g.id))
    return {
      id: g.id,
      saved,
      pct: pctOf(g, saved),
      picked: isPicked,
      give: n,
      after,
      pctAfter: pctOf(g, after),
      all: n > 0 && n === saved,
    }
  })
  const total = rows.reduce((s, r) => s + r.give, 0)
  const rest = Math.max(0, Math.floor(gap) - total)
  return { rows, rest, covered: rest === 0, total }
}

// {goalId, nim} for every row that gives something. These are the picks lib/goals.js keepInWallet writes.
export function writes({ rows = [] } = {}) {
  return rows.filter((r) => r.give > 0).map((r) => ({ goalId: r.id, nim: r.give }))
}

const pctOf = (g, nim) => (g.targetNim > 0 ? Math.round((nim / g.targetNim) * 100) : 0)
