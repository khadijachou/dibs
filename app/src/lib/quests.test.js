import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
const { checkQuest, currentQuest, pickQuest, questState } = await import('./quests.js')
const { isoWeek } = await import('./xp.js')

beforeEach(() => store.clear())

const at = (d, h = 12) => new Date(2026, 10, d, h).getTime() // November 2026, local
const iso = (ms) => new Date(ms).toISOString()
let n = 0
const goal = (over = {}) => ({
  id: `g${++n}`, brandKey: 'steam', targetNim: 1000, status: 'saving', createdAt: iso(at(2, 9)), deadline: iso(at(2, 9) + 70 * 864e5), deposits: [], ...over,
})
const dep = (nim, ms, extra = {}) => ({ nim, at: iso(ms), ...extra })
const ALL_CHIPS = ['steam', 'airbnb', 'amazon', 'netflix', 'ubereats'].map((brandKey) => ({ brandKey, status: 'redeemed' }))
// A week number giving a known index for a given number of kinds.
const weekWith = (count, index) => { for (let d = 1; d < 400; d++) { const ms = new Date(2026, 0, d, 12).getTime(); if (isoWeek(ms) % count === index) return ms } }

test('round: the goal closest to its next 10 % step', () => {
  const a = goal({ deposits: [dep(150, at(2))] }) // 15 % -> 20 %: 50 NIM
  const b = goal({ deposits: [dep(280, at(2))] }) // 28 % -> 30 %: 20 NIM
  const q = pickQuest([a, b, ...ALL_CHIPS.map((g) => goal(g))], weekWith(1, 0))
  assert.equal(q.id, 'round')
  assert.equal(q.goalId, b.id)
  assert.deepEqual([q.from, q.to, q.amount], [28, 30, 20])
})

test('round: at least 100 NIM when the user never deposited', () => {
  const q = pickQuest([goal(), ...ALL_CHIPS.map((g) => goal(g))], weekWith(2, 0))
  assert.equal(q.id, 'round')
  assert.deepEqual([q.from, q.to, q.amount], [0, 10, 100])
})

test('week: the goal furthest behind, with its amount this week', () => {
  const start = at(2) - 21 * 864e5
  const behind = goal({ createdAt: iso(start), deadline: iso(start + 70 * 864e5), deposits: [dep(50, start + 864e5)] })
  // round and week apply (new does not: every category has a goal); index 1 is week.
  const wk = pickQuest([behind, ...ALL_CHIPS.map((g) => goal(g))], weekWith(2, 1))
  assert.equal(wk.id, 'week')
  assert.equal(wk.goalId, behind.id)
  assert.ok(wk.amount > 0)
})

test('new: the first category in catalogue order with no goal, any status', () => {
  const goals = [goal({ brandKey: 'steam', status: 'withdrawn' }), goal({ brandKey: 'netflix', status: 'redeemed' })]
  const q = pickQuest(goals, weekWith(1, 0))
  assert.deepEqual([q.id, q.chip], ['new', 'travel'])
})

test('rotation: ISO week number mod the number of kinds that apply', () => {
  // 90 % and ahead of its plan: round applies, week does not; new applies (travel has no goal). Two kinds.
  const goals = [goal({ deposits: [dep(900, at(2))] })]
  assert.equal(pickQuest(goals, weekWith(2, 0)).id, 'round')
  assert.equal(pickQuest(goals, weekWith(2, 1)).id, 'new')
})

test('no quest when nothing applies', () => {
  assert.equal(pickQuest(ALL_CHIPS.map((g) => goal(g)), at(3)), null)
})

test('done detection: round, week, new', () => {
  const now = at(4)
  const g = goal({ deposits: [dep(280, at(2))] })
  const round = { id: 'round', goalId: g.id, from: 28, to: 30, amount: 20, base: 280 }
  assert.deepEqual(questState(round, [g], now), { done: false, progress: 0, hidden: false })
  g.deposits.push(dep(10, at(3)))
  assert.equal(questState(round, [g], now).progress, 0.5)
  g.deposits.push(dep(10, at(3)))
  assert.equal(questState(round, [g], now).done, true)

  const w = goal({ deposits: [dep(500, at(1))] }) // last week's deposit does not count
  const week = { id: 'week', goalId: w.id, amount: 60 }
  assert.equal(questState(week, [w], now).done, false)
  w.deposits.push(dep(30, at(3)), dep(100, at(3), { kind: 'move' }), dep(30, at(4)))
  assert.equal(questState(week, [w], now).done, true)

  const nq = { id: 'new', chip: 'travel' }
  assert.equal(questState(nq, [goal({ brandKey: 'airbnb', createdAt: iso(at(1)) })], now).done, false) // last week
  assert.equal(questState(nq, [goal({ brandKey: 'airbnb', createdAt: iso(at(3)) })], now).done, true)
})

test('hidden when the goal is deleted, bought or withdrawn', () => {
  const q = { id: 'round', goalId: 'gone', from: 0, to: 10, amount: 100, base: 0 }
  assert.equal(questState(q, [], at(3)).hidden, true)
  assert.equal(questState({ ...q, goalId: 'b' }, [goal({ id: 'b', status: 'redeemed' })], at(3)).hidden, true)
  assert.equal(questState({ ...q, goalId: 'w' }, [goal({ id: 'w', status: 'withdrawn' })], at(3)).hidden, true)
})

test('kept for the week, picked again the next week; done recorded once', () => {
  const g = goal({ deposits: [dep(280, at(2))] })
  const first = currentQuest([g], at(3))
  assert.equal(currentQuest([g, goal({ brandKey: 'airbnb' })], at(6)).id, first.id) // same week: unchanged
  assert.equal(first.week, '2026-11-02')
  const next = currentQuest([g], at(10))
  assert.equal(next.week, '2026-11-09')
  store.clear()
  store.set('dibs.quest', JSON.stringify({ week: '2026-11-02', id: 'round', goalId: g.id, from: 28, to: 30, amount: 20, base: 280 }))
  g.deposits.push(dep(20, at(3)))
  assert.equal(checkQuest([g], at(4)).justDone, true)
  assert.equal(checkQuest([g], at(4)).justDone, false)
  assert.equal(JSON.parse(store.get('dibs.quests.done')).length, 1)
})
