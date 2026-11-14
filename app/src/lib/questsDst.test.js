// consecutiveFull must step by calendar day, not by a fixed 24 h, so a 23-hour day (clock change) is never skipped.
// This file pins a DST timezone; Node's test runner isolates each file in its own process, so it does not affect others.
process.env.TZ = 'America/New_York'
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
const { consecutiveFull } = await import('./quests.js')
const { recordDailyDay, dayKey, dayStart } = await import('./xp.js')

beforeEach(() => store.clear())

test('consecutiveFull steps by calendar day across a 23-hour day (spring forward)', () => {
  // America/New_York springs forward on Sunday 8 March 2026: that local day is 23 hours.
  const d8 = new Date(2026, 2, 8).getTime(); const d9 = new Date(2026, 2, 9).getTime()
  assert.equal(dayStart(dayKey(d9)) - dayStart(dayKey(d8)), 23 * 3600 * 1000, 'the 8th is a 23-hour day (timezone applied)')
  // Seven full days in a row, 3 to 9 March, including the short day.
  for (let day = 3; day <= 9; day++) recordDailyDay(dayKey(new Date(2026, 2, day).getTime()), { xp: 15, quests: 2, full: true, add: false })
  assert.equal(consecutiveFull(new Date(2026, 2, 9, 12).getTime()), 7)
  // A gap on the 6th breaks the run at the 7th.
  store.clear()
  for (const day of [3, 4, 5, 7, 8, 9]) recordDailyDay(dayKey(new Date(2026, 2, day).getTime()), { xp: 15, quests: 2, full: true, add: false })
  assert.equal(consecutiveFull(new Date(2026, 2, 9, 12).getTime()), 3) // 9, 8, 7, then the 6th is missing
})
