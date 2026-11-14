import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankGoals, rankOf, dueLocally, nextUpGoal, noteLeftFor, takeLeftFor } from './goalOrder.js'
import { FALLBACK_MS } from './release.js'

const DAY = 864e5
const WEEK = 7 * DAY
const NOW = 1_700_000_000_000 // fixed clock for every case

// A 10-week plan, target 1000, so weekly = 100, and now sits at the end of week index 5.
// dueByWeekEnd = 600. saved 700 -> ahead, 500/550 -> on track, 400 -> behind (lag 1),
// 300 -> late (lag 2), 100 -> late (lag 4), >= 1000 -> reached.
const START = NOW - 5 * WEEK
const END = NOW + 5 * WEEK
let seq = 0
function saving(saved, over = {}) {
  seq += 1
  return {
    id: over.id || `g${seq}`,
    status: 'saving',
    targetNim: 1000,
    deposits: [{ nim: saved }],
    createdAt: new Date(over.createdAt ?? START).toISOString(),
    deadline: new Date(over.deadline ?? END).toISOString(),
    region: 'US',
    currency: 'USD',
  }
}
const ready = (over = {}) => ({ ...saving(1000, over), status: 'ready' })
const unlocking = (over = {}) => ({ ...saving(1000, over), status: 'unlocking' })
const ids = (list) => list.map((g) => g.id)
const ctx = (due = {}) => ({ now: NOW, due })

test('each rank comes before the next, from ready (1) to ahead (7)', () => {
  const r1 = ready({ id: 'r1' })
  const r2 = unlocking({ id: 'r2' })
  const r3 = saving(1000, { id: 'r3' }) // 100% reached, still saving
  const r4 = unlocking({ id: 'r4' })
  const r5 = saving(400, { id: 'r5' }) // behind
  const r6 = saving(500, { id: 'r6' }) // on track
  const r7 = saving(700, { id: 'r7' }) // ahead
  assert.deepEqual([rankOf(r1, ctx()), rankOf(r2, ctx({ r2: true })), rankOf(r3, ctx()), rankOf(r4, ctx()), rankOf(r5, ctx()), rankOf(r6, ctx()), rankOf(r7, ctx())], [1, 2, 3, 4, 5, 6, 7])
  // Shuffled in, they come out in rank order.
  const sorted = rankGoals([r5, r7, r2, r6, r4, r1, r3], ctx({ r2: true }))
  assert.deepEqual(ids(sorted), ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'])
})

test('ties inside a rank: nearest deadline first, then the oldest goal', () => {
  const near = ready({ id: 'near', deadline: NOW + 2 * WEEK })
  const far = ready({ id: 'far', deadline: NOW + 9 * WEEK })
  assert.deepEqual(ids(rankGoals([far, near], ctx())), ['near', 'far'])
  // Same deadline: the oldest createdAt wins.
  const old = ready({ id: 'old', deadline: NOW + 4 * WEEK, createdAt: NOW - 8 * WEEK })
  const young = ready({ id: 'young', deadline: NOW + 4 * WEEK, createdAt: NOW - 1 * WEEK })
  assert.deepEqual(ids(rankGoals([young, old], ctx())), ['old', 'young'])
})

test('inside rank 5, more weeks behind comes first', () => {
  const lag2 = saving(300, { id: 'lag2' }) // late, lag 2
  const lag4 = saving(100, { id: 'lag4' }) // late, lag 4
  const lag1 = saving(400, { id: 'lag1' }) // behind, lag 1
  assert.deepEqual([rankOf(lag2, ctx()), rankOf(lag4, ctx()), rankOf(lag1, ctx())], [5, 5, 5])
  assert.deepEqual(ids(rankGoals([lag1, lag2, lag4], ctx())), ['lag4', 'lag2', 'lag1'])
})

test('inside ranks 6 and 7, higher progress comes first', () => {
  const on500 = saving(500, { id: 'on500' })
  const on550 = saving(550, { id: 'on550' })
  assert.deepEqual([rankOf(on500, ctx()), rankOf(on550, ctx())], [6, 6])
  assert.deepEqual(ids(rankGoals([on500, on550], ctx())), ['on550', 'on500'])
  const ah700 = saving(700, { id: 'ah700' })
  const ah800 = saving(800, { id: 'ah800' })
  assert.deepEqual([rankOf(ah700, ctx()), rankOf(ah800, ctx())], [7, 7])
  assert.deepEqual(ids(rankGoals([ah700, ah800], ctx())), ['ah800', 'ah700'])
})

test('an unlocking goal ranks 4 with no release answer or a false one, 2 with a true one', () => {
  const g = unlocking({ id: 'u' })
  assert.equal(rankOf(g, ctx()), 4) // no due map
  assert.equal(rankOf(g, ctx({ u: false })), 4)
  assert.equal(rankOf(g, ctx({ u: true })), 2)
})

test('redeemed and withdrawn goals are left out', () => {
  const live = saving(500, { id: 'live' })
  const done = { ...saving(1000, { id: 'done' }), status: 'redeemed' }
  const gone = { ...saving(1000, { id: 'gone' }), status: 'withdrawn' }
  const out = rankGoals([done, live, gone], ctx())
  assert.deepEqual(ids(out), ['live'])
})

test('the input array and its goals are not mutated, and the result is a new array', () => {
  const input = [saving(700, { id: 'a' }), unlocking({ id: 'b' }), ready({ id: 'c' }), saving(300, { id: 'd' })]
  const before = JSON.parse(JSON.stringify(input))
  const out = rankGoals(input, ctx({ b: true }))
  assert.notEqual(out, input)
  assert.deepEqual(input, before) // array and every goal unchanged
})

test('a goal with missing or broken fields does not throw', () => {
  const broken = { id: 'broken', status: 'saving' } // no deposits, no target, no dates
  const noTarget = { id: 'nt', status: 'saving', deposits: [{ nim: 50 }] }
  assert.doesNotThrow(() => rankOf(broken, ctx()))
  assert.doesNotThrow(() => rankOf(noTarget, ctx()))
  const out = rankGoals([broken, saving(500, { id: 'ok' }), noTarget], ctx())
  assert.ok(out.length === 3) // a readable one plus two unreadable, none dropped, none thrown
})

test('Next up: the first ranked goal that is not unlocking', () => {
  const dueUnlock = unlocking({ id: 'due' }) // rank 2 with a true flag
  const reached = saving(1000, { id: 'reached' }) // rank 3
  // The unlocking goal would rank first but Next up skips it; reached wins.
  assert.equal(nextUpGoal([reached, dueUnlock], NOW)?.id, 'reached')
})

test('Next up: behind plan comes before a closer on-track goal', () => {
  const behind = saving(400, { id: 'behind' }) // rank 5
  const onTrackCloser = saving(550, { id: 'closer' }) // rank 6, closer to 100%
  assert.equal(nextUpGoal([onTrackCloser, behind], NOW)?.id, 'behind')
})

test('Next up: ready and reached still win over a saving goal', () => {
  const r = ready({ id: 'r' })
  const reached = saving(1000, { id: 'reached' })
  const onTrack = saving(500, { id: 'on' })
  assert.equal(nextUpGoal([onTrack, reached], NOW)?.id, 'reached')
  assert.equal(nextUpGoal([onTrack, reached, r], NOW)?.id, 'r')
})

const iso = (ms) => new Date(ms).toISOString()
const unl = (steps) => ({ id: 'u', status: 'unlocking', unlockSteps: steps })

test('dueLocally: a retire step on record is due', () => {
  assert.equal(dueLocally(unl([{ step: 'deactivate', at: iso(NOW) }, { step: 'retire', at: iso(NOW) }]), NOW), true)
})

test('dueLocally: a deactivate step older than the fallback is due', () => {
  assert.equal(dueLocally(unl([{ step: 'deactivate', at: iso(NOW - FALLBACK_MS - 1000) }]), NOW), true)
})

test('dueLocally: a deactivate step newer than the fallback is not due', () => {
  assert.equal(dueLocally(unl([{ step: 'deactivate', at: iso(NOW - 1000) }]), NOW), false)
})

test('dueLocally: no deactivate step is not due', () => {
  assert.equal(dueLocally(unl([]), NOW), false)
  assert.equal(dueLocally({ id: 'u', status: 'unlocking' }, NOW), false)
})

test('dueLocally: an unreadable deactivate date is not due', () => {
  assert.equal(dueLocally(unl([{ step: 'deactivate', at: 'not-a-date' }]), NOW), false)
})

test('dueLocally: a non-unlocking goal is never due', () => {
  assert.equal(dueLocally({ status: 'saving', unlockSteps: [{ step: 'retire', at: iso(NOW) }] }, NOW), false)
  assert.equal(dueLocally(null, NOW), false)
})

test('rankGoals puts a locally due unlocking goal at rank 2 with no ctx.due', () => {
  const due = { ...unlocking({ id: 'du' }), unlockSteps: [{ step: 'retire', at: iso(NOW) }] }
  const waiting = { ...unlocking({ id: 'wa' }), unlockSteps: [{ step: 'deactivate', at: iso(NOW) }] }
  assert.equal(rankOf(due, { now: NOW }), 2)
  assert.equal(rankOf(waiting, { now: NOW }), 4)
  assert.deepEqual(ids(rankGoals([waiting, due], { now: NOW })), ['du', 'wa']) // due before waiting, no ctx.due
})

test('the left-for note is read once and then cleared', () => {
  assert.equal(takeLeftFor(), null)
  noteLeftFor('goal-1')
  assert.equal(takeLeftFor(), 'goal-1')
  assert.equal(takeLeftFor(), null) // cleared after the first read
})
