import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addCaptionKey } from './addCaption.js'
import { planOf } from './pace.js'

const DAY = 864e5
const now = Date.UTC(2026, 10, 12, 12)
// 4,000 NIM over 8 weeks (500 a week), created ageDays ago, with saved NIM in one deposit.
const goal = (ageDays, saved) => ({
  targetNim: 4000,
  createdAt: new Date(now - ageDays * DAY).toISOString(),
  deadline: new Date(now - ageDays * DAY + 56 * DAY).toISOString(),
  deposits: saved ? [{ nim: saved }] : [],
})
// Same as Home GoalHero.
const nextOf = (p) => Math.max(1, Math.min(p.remaining, p.pace.amount || p.weekly))
const caption = (ageDays, saved) => { const p = planOf(goal(ageDays, saved), now); return [p.pace.kind, addCaptionKey(p, nextOf(p))] }

test('on track: this week’s step', () => {
  assert.deepEqual(caption(1, 0), ['onTrack', 'add_cap_week'])
  assert.deepEqual(caption(8, 600), ['onTrack', 'add_cap_week'])
})

test('behind and late: catch-up step', () => {
  assert.deepEqual(caption(15, 500), ['behind', 'add_cap_catchup'])
  assert.deepEqual(caption(29, 500), ['late', 'add_cap_catchup'])
})

test('ahead of plan: no caption', () => {
  assert.deepEqual(caption(8, 1500), ['ahead', null])
})

test('the amount is all that remains: last step, over every other case', () => {
  assert.deepEqual(caption(50, 3800), ['onTrack', 'add_cap_last']) // last week, 200 left
  assert.deepEqual(caption(1, 3800), ['ahead', 'add_cap_last'])
  assert.deepEqual(caption(52, 500), ['late', 'add_cap_last']) // last week of the plan: remaining / 1 week
})

test('done or no plan: no caption', () => {
  assert.deepEqual(caption(8, 4000), ['done', null])
  assert.equal(addCaptionKey(null, 1), null)
})
