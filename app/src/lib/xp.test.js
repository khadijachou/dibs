import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
const { dayKey, levelOf, nextRank, rankOf, recordVisit, getVisits, rhythm, shownXp, totalXp, weekKey, weekStart, xpEvents, XP } = await import('./xp.js')

beforeEach(() => store.clear())

// Local times: Monday 2 November 2026 is a Monday.
const at = (d, h = 12) => new Date(2026, 10, d, h).getTime()
const iso = (ms) => new Date(ms).toISOString()
const MON = at(2)
const sum = (events, kind) => events.filter((e) => !kind || e.kind === kind).reduce((s, e) => s + e.xp, 0)
const goal = (deposits, over = {}) => ({ id: 'g' + Math.random(), targetNim: 10000, status: 'saving', createdAt: iso(at(1)), deposits, ...over })
const dep = (nim, ms, extra = {}) => ({ nim, at: iso(ms), ...extra })

test('weeks start on Monday, local time', () => {
  assert.equal(new Date(weekStart(at(8, 23))).getDay(), 1)
  assert.equal(weekKey(at(8, 23)), '2026-11-02') // Sunday 8 Nov belongs to the week of Monday 2 Nov
  assert.equal(weekKey(at(9, 0)), '2026-11-09')
  assert.equal(dayKey(at(3, 1)), '2026-11-03')
})

test('deposits: +10 each, at most 3 a day', () => {
  const g = goal([dep(10, at(3, 8)), dep(10, at(3, 9)), dep(10, at(3, 10)), dep(10, at(3, 11)), dep(10, at(4, 9))])
  assert.equal(sum(xpEvents({ goals: [g] }), 'deposit'), 40)
})

test('a move or a withdrawal is not a deposit', () => {
  const g = goal([dep(500, at(3), { kind: 'move' }), dep(-200, at(3), { kind: 'withdraw' }), dep(-50, at(3), { kind: 'move' })])
  assert.equal(sum(xpEvents({ goals: [g] }), 'deposit'), 0)
  assert.equal(sum(xpEvents({ goals: [g] }), 'thousand'), 0)
})

test('+5 at every 1,000 NIM of real deposits, across goals; withdrawals never subtract', () => {
  const a = goal([dep(600, at(3, 8)), dep(-600, at(3, 9), { kind: 'withdraw' })])
  const b = goal([dep(500, at(3, 10)), dep(2000, at(4, 10))])
  const ev = xpEvents({ goals: [a, b] })
  const steps = ev.filter((e) => e.kind === 'thousand')
  assert.deepEqual(steps.map((e) => e.xp), [5, 10]) // 1,100 crosses 1,000; 3,100 crosses 2,000 and 3,000
  assert.equal(steps[0].at, at(3, 10))
})

test('milestones 25 / 50 / 75 % once per goal, moves count like savedNim', () => {
  const g = goal([dep(2500, at(3)), dep(-1000, at(4), { kind: 'move' }), dep(1000, at(5), { kind: 'move' }), dep(5000, at(6))], { targetNim: 10000 })
  const m = xpEvents({ goals: [g] }).filter((e) => e.kind === 'milestone')
  assert.equal(m.length, 3)
  assert.deepEqual(m.map((e) => e.at), [at(3), at(6), at(6)])
})

test('badges, shares, quests, cards and opens', () => {
  const ev = xpEvents({
    goals: [goal([], { status: 'redeemed', payment: { at: iso(at(5)) } })],
    badges: { first: { at: iso(at(3)) }, planted: { at: iso(at(4)) } },
    sharedIds: [{ id: 'first', at: iso(at(4)) }],
    visits: ['2026-11-03', '2026-11-04'],
    questsDone: [{ week: '2026-11-02', id: 'round', at: iso(at(5)) }],
  })
  assert.equal(sum(ev, 'badge'), 2 * XP.badge)
  assert.equal(sum(ev, 'share'), XP.share)
  assert.equal(sum(ev, 'quest'), XP.quest)
  assert.equal(sum(ev, 'card'), XP.card)
  assert.equal(sum(ev, 'open'), 2 * XP.open)
})

test('rhythm goes up one per week with a visit, capped at 5, down one after a missed week', () => {
  const weeks = (n) => Array.from({ length: n }, (_, i) => dayKey(new Date(2026, 8, 7 + 7 * i, 12).getTime())) // Mondays from 7 Sep
  const v = weeks(7)
  const thisWeek = new Date(2026, 8, 7 + 7 * 7, 12).getTime()
  assert.deepEqual(rhythm(v.slice(0, 1), new Date(2026, 8, 14, 12).getTime()), { level: 1, weeks: 1 })
  assert.equal(rhythm(v.slice(0, 3), new Date(2026, 8, 28, 12).getTime()).level, 3)
  assert.equal(rhythm(v, thisWeek).level, 5) // 7 weeks in a row: capped
  assert.equal(rhythm(v, thisWeek).weeks, 7)
  const missed = new Date(2026, 8, 7 + 7 * 8, 12).getTime() // the 8th week had no visit
  assert.deepEqual(rhythm(v, missed), { level: 4, weeks: 0 })
})

test('the weekly bonus applies to that week only', () => {
  const visits = ['2026-11-02', '2026-11-09'] // week 1 visited, so week 2 has +10 %
  const ev = [{ at: at(3), xp: 100, kind: 'x' }, { at: at(10), xp: 100, kind: 'x' }]
  assert.equal(totalXp(ev, visits, at(10)), 100 + 110)
  assert.equal(totalXp([{ at: at(10), xp: 15, kind: 'x' }], visits, at(10)), 16) // floor(15 x 1.1)
})

test('levelOf', () => {
  assert.deepEqual(levelOf(0), { level: 1, into: 0, need: 100 })
  assert.deepEqual(levelOf(99), { level: 1, into: 99, need: 100 })
  assert.deepEqual(levelOf(100), { level: 2, into: 0, need: 150 })
  assert.deepEqual(levelOf(249), { level: 2, into: 149, need: 150 })
  assert.deepEqual(levelOf(250), { level: 3, into: 0, need: 200 })
})

test('rankOf and nextRank', () => {
  assert.equal(rankOf(4).id, 'starter')
  assert.equal(rankOf(5).id, 'saver')
  assert.equal(rankOf(49).id, 'treasurer')
  assert.equal(rankOf(50).id, 'legend')
  assert.equal(nextRank(4).id, 'saver')
  assert.equal(nextRank(50), null)
})

test('shownXp never goes below the stored best', () => {
  assert.equal(shownXp(120), 120)
  assert.equal(shownXp(80), 120)
  assert.equal(shownXp(300), 300)
  assert.equal(store.get('dibs.xp.best'), '300')
})

test('recordVisit keeps one entry per day, sorted', () => {
  recordVisit(at(4))
  recordVisit(at(4, 20))
  recordVisit(at(3))
  assert.deepEqual(getVisits(), ['2026-11-03', '2026-11-04'])
})

test('daily records add XP as kind daily; existing sources are unchanged without them', () => {
  const g = goal([dep(10, at(3, 8))])
  const base = xpEvents({ goals: [g], visits: ['2026-11-03'] })
  const withDaily = xpEvents({ goals: [g], visits: ['2026-11-03'], dailyDays: { '2026-11-03': { xp: 15, quests: 2, full: true }, '2026-11-04': { xp: 0 } } })
  assert.equal(sum(base, 'daily'), 0)
  assert.equal(sum(withDaily, 'daily'), 15) // a zero-XP day adds nothing
  for (const k of ['open', 'deposit', 'thousand']) assert.equal(sum(withDaily, k), sum(base, k))
})

test('a done weekly quest gives 30 for days5 and 40 for the others', () => {
  const ev = xpEvents({ questsDone: [{ week: '2026-11-02', id: 'days5', at: iso(at(5)) }, { week: '2026-11-09', id: 'round', at: iso(at(10)) }] })
  assert.deepEqual(ev.filter((e) => e.kind === 'quest').map((e) => e.xp).sort((a, b) => a - b), [30, 40])
})
