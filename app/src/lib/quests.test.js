import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
const { checkQuest, currentQuest, pickQuest, questState,
  dailyPool, pickDaily, currentDaily, dailyState, markDailyOpen, checkDaily, slotKey, isGraduated } = await import('./quests.js')
const { isoWeek, dayKey, getDailyDays, recordDailyDay } = await import('./xp.js')

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
  // round, two and days5 apply (new does not: every category has a goal); three kinds, index 0 is round.
  const q = pickQuest([a, b, ...ALL_CHIPS.map((g) => goal(g))], weekWith(3, 0))
  assert.equal(q.id, 'round')
  assert.equal(q.goalId, b.id)
  assert.deepEqual([q.from, q.to, q.amount], [28, 30, 20])
})

test('round: at least 100 NIM when the user never deposited', () => {
  // round, week and days5 apply (new does not; two needs two saving goals); three kinds, index 0 is round.
  const q = pickQuest([goal(), ...ALL_CHIPS.map((g) => goal(g))], weekWith(3, 0))
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
  // 90 % and ahead of its plan: round and new apply (week does not; two needs two goals); days5 always applies to an
  // active goal. Three kinds, in order round, new, days5.
  const goals = [goal({ deposits: [dep(900, at(2))] })]
  assert.equal(pickQuest(goals, weekWith(3, 0)).id, 'round')
  assert.equal(pickQuest(goals, weekWith(3, 1)).id, 'new')
  assert.equal(pickQuest(goals, weekWith(3, 2)).id, 'days5')
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

test('no goal at all: no quest, nothing stored', () => {
  assert.equal(pickQuest([], at(3)), null)
  assert.equal(currentQuest([], at(3)), null)
  assert.equal(store.get('dibs.quest'), undefined)
  assert.deepEqual(checkQuest([], at(3)), { quest: null, state: null, justDone: false })
})

test('the first goal: a quest is picked at the next check and that goal does not complete it', () => {
  assert.equal(currentQuest([], at(3, 9)), null)
  const first = goal({ brandKey: 'steam', createdAt: iso(at(3, 10)), deadline: iso(at(3, 10) + 70 * 864e5) })
  const r = checkQuest([first], at(3, 11))
  assert.ok(r.quest)
  assert.equal(r.quest.pickedAt, iso(at(3, 11)))
  assert.equal(r.state.done, false)
  assert.equal(JSON.parse(store.get('dibs.quest')).week, '2026-11-02')
})

test('New territory: done only by a goal created after the pick', () => {
  const q = { week: '2026-11-02', id: 'new', chip: 'travel', pickedAt: iso(at(3, 12)) }
  const before = goal({ brandKey: 'airbnb', createdAt: iso(at(3, 11)) }) // same week, before the pick
  assert.equal(questState(q, [before], at(4)).done, false)
  const after = goal({ brandKey: 'airbnb', createdAt: iso(at(3, 13)) })
  assert.equal(questState(q, [before, after], at(4)).done, true)
})

// ---- Weekly: the two new kinds ----

const kindsOver = (goals) => { const s = new Set(); for (let d = 1; d < 70; d++) { const q = pickQuest(goals, new Date(2026, 0, d, 12).getTime()); if (q) s.add(q.id) } return s }

test('weekly two: offered only with two saving goals under 100 %, progress 0, 1/2, 1', () => {
  assert.ok(kindsOver([goal({ id: 'a' }), goal({ id: 'b' })]).has('two'))
  assert.ok(!kindsOver([goal({ id: 'a' })]).has('two'))
  const a = goal({ id: 'a' }); const b = goal({ id: 'b' }); const q = { id: 'two' }
  assert.deepEqual([questState(q, [a, b], at(4)).done, questState(q, [a, b], at(4)).count], [false, 0])
  a.deposits.push(dep(30, at(3)))
  assert.equal(questState(q, [a, b], at(4)).count, 1)
  b.deposits.push(dep(30, at(4)), dep(100, at(4), { kind: 'move' }))
  assert.deepEqual([questState(q, [a, b], at(4)).done, questState(q, [a, b], at(4)).count], [true, 2])
})

test('weekly days5: offered with an active goal (not only-redeemed), progress from visit days this week', () => {
  assert.ok(kindsOver([goal({ id: 'a' })]).has('days5'))
  assert.ok(!kindsOver(ALL_CHIPS.map((g) => goal(g))).has('days5'))
  const g = goal(); const q = { id: 'days5' }
  store.set('dibs.visits', JSON.stringify(['2026-11-02', '2026-11-03', '2026-11-04']))
  assert.deepEqual([questState(q, [g], at(4)).done, questState(q, [g], at(4)).count], [false, 3])
  store.set('dibs.visits', JSON.stringify(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']))
  assert.deepEqual([questState(q, [g], at(4)).done, questState(q, [g], at(4)).count], [true, 5])
})

// ---- Daily quests ----

const todayKey = dayKey(at(4))
const setDaily = (slots, done = ['open']) => store.set('dibs.daily', JSON.stringify({ day: todayKey, slots, done, bonus: false }))
const readState = (goals) => dailyState(JSON.parse(store.get('dibs.daily')), goals, at(4))
const slotDone = (goals, id) => readState(goals).slots.find((s) => s.id === id)?.done

test('daily pool: a new user gets catalog and badges only', () => {
  assert.deepEqual(dailyPool([], at(4)).map((s) => s.id).sort(), ['badges', 'catalog'])
})

test('daily pool: savings, category, goal, history and add appear with an active goal behind plan', () => {
  const g = goal({ deposits: [dep(50, at(2))] })
  const ids = dailyPool([g], at(4)).map((s) => s.id)
  for (const id of ['savings', 'catalog', 'badges', 'category', 'goal', 'history', 'add']) assert.ok(ids.includes(id), id)
})

test('daily pool: add drops out when the goal is ahead of plan or at 100 %, or twice already this week', () => {
  assert.ok(!dailyPool([goal({ deposits: [dep(900, at(3))] })], at(4)).some((s) => s.id === 'add'), 'ahead')
  assert.ok(!dailyPool([goal({ deposits: [dep(1000, at(3))] })], at(4)).some((s) => s.id === 'add'), '100 %')
  const g = goal({ deposits: [dep(50, at(2))] })
  recordDailyDay('2026-11-02', { xp: 0, quests: 0, full: false, add: true })
  recordDailyDay('2026-11-03', { xp: 0, quests: 0, full: false, add: true })
  assert.ok(!dailyPool([g], at(4)).some((s) => s.id === 'add'), 'twice already')
})

test('daily pick: check-in first, two different real quests, deterministic for the day and data', () => {
  const g = goal({ deposits: [dep(50, at(2))] })
  const a = pickDaily([g], at(4))
  assert.equal(a.slots[0].id, 'open')
  assert.deepEqual(a.done, ['open'])
  assert.equal(a.slots.length, 3)
  assert.notEqual(a.slots[1].id, a.slots[2].id)
  const always = a.slots.slice(1).filter((s) => ['savings', 'catalog', 'badges'].includes(s.id)).length
  assert.ok(always <= 1, 'at most one anytime quest when a goal quest is available')
  assert.deepEqual(pickDaily([g], at(4)), a) // same day and data: same pick
})

test('completion: each open hook marks only its own slot', () => {
  const g = goal({ id: 'g1', brandKey: 'airbnb' }) // travel
  setDaily([{ id: 'open' }, { id: 'savings' }, { id: 'badges' }])
  markDailyOpen({ k: 'savings' }, [g], at(4)); assert.ok(slotDone([g], 'savings'))

  setDaily([{ id: 'open' }, { id: 'catalog' }, { id: 'category', chip: 'travel' }])
  markDailyOpen({ k: 'brand', chip: 'games' }, [g], at(4))
  assert.ok(slotDone([g], 'catalog') && !slotDone([g], 'category'))
  markDailyOpen({ k: 'brand', chip: 'travel' }, [g], at(4)); assert.ok(slotDone([g], 'category'))

  setDaily([{ id: 'open' }, { id: 'goal', goalId: 'g1' }, { id: 'history' }])
  markDailyOpen({ k: 'goal', goalId: 'other' }, [g], at(4)); assert.ok(!slotDone([g], 'goal'))
  markDailyOpen({ k: 'goal', goalId: 'g1' }, [g], at(4)); assert.ok(slotDone([g], 'goal'))
  markDailyOpen({ k: 'history' }, [g], at(4)); assert.ok(slotDone([g], 'history'))

  setDaily([{ id: 'open' }, { id: 'badges' }, { id: 'savings' }])
  markDailyOpen({ k: 'badges' }, [g], at(4)); assert.ok(slotDone([g], 'badges'))
})

test('completion: Add NIM reads a real deposit dated today, not a move, a withdrawal or an older deposit', () => {
  const g = goal({ id: 'g1', deposits: [dep(20, at(4))] })
  setDaily([{ id: 'open' }, { id: 'add', goalId: 'g1' }, { id: 'badges' }])
  checkDaily([g], at(4)); assert.ok(slotDone([g], 'add'))

  store.clear()
  const g2 = goal({ id: 'g2', deposits: [dep(100, at(4), { kind: 'move' }), dep(-30, at(4), { kind: 'withdraw' }), dep(50, at(3))] })
  setDaily([{ id: 'open' }, { id: 'add', goalId: 'g2' }, { id: 'badges' }])
  checkDaily([g2], at(4)); assert.ok(!slotDone([g2], 'add'))
})

test('a slot whose goal is gone is hidden and drops out of the count', () => {
  const g = goal({ id: 'g1', status: 'redeemed' })
  setDaily([{ id: 'open' }, { id: 'goal', goalId: 'g1' }, { id: 'badges' }])
  const st = readState([g])
  assert.equal(st.total, 2)
  assert.ok(!st.slots.some((s) => s.id === 'goal'))
})

test('the all-done bonus is counted once, only when every slot is done', () => {
  const g = goal({ id: 'g1' })
  setDaily([{ id: 'open' }, { id: 'savings' }, { id: 'badges' }])
  markDailyOpen({ k: 'savings' }, [g], at(4))
  let rec = getDailyDays()[todayKey]
  assert.deepEqual([rec.full, rec.xp], [false, 5])
  markDailyOpen({ k: 'badges' }, [g], at(4))
  rec = getDailyDays()[todayKey]
  assert.deepEqual([rec.full, rec.quests, rec.xp], [true, 2, 15]) // two quests (5+5) plus the +5 bonus, once
})

test('midnight rollover: a new set the next day, yesterday\'s XP kept, no trace of unfinished quests', () => {
  const g = goal({ id: 'g1', deposits: [dep(50, at(2))] })
  store.set('dibs.daily', JSON.stringify({ day: dayKey(at(3)), slots: [{ id: 'open' }, { id: 'savings' }, { id: 'badges' }], done: ['open', 'savings'], bonus: false }))
  recordDailyDay(dayKey(at(3)), { xp: 5, quests: 1, full: false, add: false })
  const today = currentDaily([g], at(4))
  assert.equal(today.day, todayKey)
  assert.deepEqual(today.done, ['open'])
  assert.equal(getDailyDays()[dayKey(at(3))].xp, 5)
})

test('graduation: 7 full days in a row drops the check-in from the next day, for good', () => {
  const g = goal({ id: 'g1', deposits: [dep(50, at(2))] })
  for (let d = 1; d <= 7; d++) recordDailyDay(dayKey(at(d)), { xp: 15, quests: 2, full: true, add: false })
  store.set('dibs.daily', JSON.stringify({ day: dayKey(at(7)), slots: [{ id: 'open' }, { id: 'savings' }, { id: 'badges' }], done: ['open', 'savings', 'badges'], bonus: true }))
  checkDaily([g], at(7))
  assert.ok(isGraduated())
  const next = pickDaily([g], at(8))
  assert.ok(!next.slots.some((s) => s.id === 'open'))
  assert.equal(next.slots.length, 3)
  assert.deepEqual(next.done, [])
})

test('graduation: 6 days then a missed day does not graduate', () => {
  const g = goal({ id: 'g1', deposits: [dep(50, at(2))] })
  for (const d of [1, 2, 3, 4, 5, 6]) recordDailyDay(dayKey(at(d)), { xp: 15, quests: 2, full: true, add: false })
  // Day 7 missed; day 8 full.
  recordDailyDay(dayKey(at(8)), { xp: 15, quests: 2, full: true, add: false })
  store.set('dibs.daily', JSON.stringify({ day: dayKey(at(8)), slots: [{ id: 'open' }, { id: 'savings' }, { id: 'badges' }], done: ['open', 'savings', 'badges'], bonus: true }))
  checkDaily([g], at(8))
  assert.ok(!isGraduated())
})
