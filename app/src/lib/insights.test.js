// Insights numbers (v1.3.0). Pinned to Europe/Paris so both a spring-forward (Sun 29 Mar 2026) and a fall-back
// (Sun 25 Oct 2026) run under a real daylight-saving change; Node's test runner isolates each file in its own process.
process.env.TZ = 'Europe/Paris'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insights, goalWeekly, recap, compactNim, weekStart, weekKey, dayStart } from './insights.js'

const NBSP = ' '
// A deposit at a chosen local wall-clock time (noon unless given), as an ISO instant the code parses back.
const at = (y, mo, d, h = 12, mi = 0) => new Date(y, mo, d, h, mi, 0).toISOString()
const dep = (nim, atIso, extra = {}) => ({ nim, at: atIso, ...extra })
const goal = (deposits, status = 'saving', rest = {}) => ({ id: 'g', status, deposits, targetNim: 100000, ...rest })

test('weekStart returns the local Monday 00:00, Monday to Sunday', () => {
  // Fri 20 Nov 2026 -> Mon 16 Nov 2026.
  assert.equal(weekStart(at(2026, 10, 20, 15)), new Date(2026, 10, 16).getTime())
  // A Monday maps to itself; the Sunday before maps to the previous Monday.
  assert.equal(weekStart(at(2026, 10, 16, 0)), new Date(2026, 10, 16).getTime())
  assert.equal(weekStart(at(2026, 10, 15, 23, 59)), new Date(2026, 10, 9).getTime())
})

test('a Sunday 23:59 and the Monday 00:00 after it land in different weeks', () => {
  const sun = weekStart(at(2026, 10, 15, 23, 59)) // Sun 15 Nov
  const mon = weekStart(at(2026, 10, 16, 0, 0))    // Mon 16 Nov
  assert.notEqual(sun, mon)
  assert.equal(mon - sun, 7 * 86_400_000) // exactly one week apart (no DST this week)
})

test('weeks hold Monday to Sunday across a month change', () => {
  // Thu 2 Apr 2026 belongs to the week starting Mon 30 Mar 2026 (crosses March into April).
  assert.equal(weekStart(at(2026, 3, 2)), new Date(2026, 2, 30).getTime())
  assert.equal(weekStart(at(2026, 2, 30, 0)), new Date(2026, 2, 30).getTime())
})

test('spring-forward: the 23-hour Sunday stays in its own week, the next Monday is a new week', () => {
  // Paris springs forward Sun 29 Mar 2026; that local day is 23 hours.
  assert.equal(dayStart(at(2026, 2, 30)) - dayStart(at(2026, 2, 29)), 23 * 3_600_000, 'the 29th is a 23-hour day (TZ applied)')
  // A deposit late on the short Sunday and one on the Monday after fall in consecutive, distinct weeks.
  const now = at(2026, 3, 1, 12) // Wed 1 Apr: current week is Mon 30 Mar
  const r = insights([goal([dep(10, at(2026, 2, 29, 22)), dep(20, at(2026, 2, 30, 9))])], now)
  // Window weeks end at Mon 30 Mar (index 7). Sun 29 Mar is the previous week (index 6).
  assert.equal(r.weekly[7], 20)
  assert.equal(r.weekly[6], 10)
})

test('fall-back: the 25-hour Sunday stays in its own week', () => {
  // Paris falls back Sun 25 Oct 2026; that local day is 25 hours.
  assert.equal(dayStart(at(2026, 9, 26)) - dayStart(at(2026, 9, 25)), 25 * 3_600_000, 'the 25th is a 25-hour day (TZ applied)')
  const now = at(2026, 9, 26, 12) // Mon 26 Oct is the current week
  const r = insights([goal([dep(30, at(2026, 9, 25, 23)), dep(40, at(2026, 9, 26, 1))])], now)
  assert.equal(r.weekly[7], 40) // Mon 26 Oct
  assert.equal(r.weekly[6], 30) // Sun 25 Oct, previous week
})

test('moves, withdrawals and kept entries never count', () => {
  const now = at(2026, 10, 18, 12)
  const g = goal([
    dep(100, at(2026, 10, 17)),              // counts
    dep(-40, at(2026, 10, 17), { kind: 'move', to: 'x' }),
    dep(40, at(2026, 10, 17), { kind: 'move', from: 'y' }),
    dep(-30, at(2026, 10, 17), { kind: 'withdraw' }),
    dep(-20, at(2026, 10, 17), { kind: 'kept' }),
  ])
  const r = insights([g], now)
  assert.equal(r.total8, 100)
  assert.equal(r.weekly[7], 100)
  assert.equal(r.depositsThisMonth, 1)
})

test('redeemed and withdrawn goals still count, so history does not vanish', () => {
  const now = at(2026, 10, 18, 12)
  const goals = [
    goal([dep(100, at(2026, 10, 17))], 'redeemed'),
    goal([dep(50, at(2026, 10, 10))], 'withdrawn'),
    goal([dep(25, at(2026, 10, 16))], 'saving'),
  ]
  const r = insights(goals, now)
  assert.equal(r.total8, 175)
  assert.equal(r.goalsCount, 1) // only the saving goal is "open"
})

test('weeksSaved, thisMonth and depositsThisMonth', () => {
  const now = at(2026, 10, 18, 12) // Nov 2026; month started 1 Nov
  const g = goal([
    dep(10, at(2026, 10, 2)),   // this month, week Nov 2
    dep(20, at(2026, 10, 17)),  // this month, current week
    dep(5, at(2026, 9, 28)),    // last month (Oct), week Oct 26
  ])
  const r = insights([g], now)
  assert.equal(r.thisMonth, 30)
  assert.equal(r.depositsThisMonth, 2)
  assert.equal(r.weeksSaved, 3) // Oct 26, Nov 2, current week
})

test('bestWeek is the highest weekly total over all history, with its Monday', () => {
  const now = at(2026, 10, 18, 12)
  const g = goal([
    dep(100, at(2025, 5, 3)),   // long ago, one big week
    dep(200, at(2025, 5, 4)),   // same week: 300 total
    dep(50, at(2026, 10, 17)),  // recent
  ])
  const r = insights([g], now)
  assert.equal(r.bestWeek.nim, 300)
  assert.equal(r.bestWeek.start, weekStart(at(2025, 5, 3)))
})

test('longestRun and currentRun, including a gap and this week with and without a deposit', () => {
  // Build four consecutive weeks (an older run of 3, then a gap, then up to now).
  const now = at(2026, 10, 18, 12) // current week Mon 16 Nov
  const weeksBack = (n) => at(2026, 10, 18 - n * 7, 12)
  const withThisWeek = goal([
    dep(1, weeksBack(0)), // current week
    dep(1, weeksBack(1)),
    dep(1, weeksBack(2)),
    // gap at week 3
    dep(1, weeksBack(4)),
    dep(1, weeksBack(5)),
  ])
  let r = insights([withThisWeek], now)
  assert.equal(r.currentRun, 3)   // current, -1, -2
  assert.equal(r.longestRun, 3)   // the 0..2 run; the 4..5 run is only 2
  // Same deposits but nothing in the current week: the run counts up to last week.
  const noThisWeek = goal([
    dep(1, weeksBack(1)),
    dep(1, weeksBack(2)),
    dep(1, weeksBack(3)),
  ])
  r = insights([noThisWeek], now)
  assert.equal(r.currentRun, 3)   // -1, -2, -3 (this week empty, starts at last week)
  // A truly empty current-and-last week: run is 0.
  r = insights([goal([dep(1, weeksBack(5))])], now)
  assert.equal(r.currentRun, 0)
})

test('goalWeekly gives the same 8 weekly numbers for one goal', () => {
  const now = at(2026, 10, 18, 12)
  const g = goal([dep(10, at(2026, 10, 17)), dep(5, at(2026, 10, 10))])
  const r = goalWeekly(g, now)
  assert.equal(r.weekly.length, 8)
  assert.equal(r.weekly[7], 10)
  assert.equal(r.weekly[6], 5)
  assert.equal(r.total8, 15)
})

test('recap: the week before, its day flags, and null after an empty week', () => {
  const now = at(2026, 10, 16, 12) // Mon 16 Nov: previous week is Mon 9 - Sun 15 Nov
  const g = goal([
    dep(1000, at(2026, 10, 9)),   // Mon -> perDay[0]
    dep(500, at(2026, 10, 13)),   // Fri -> perDay[4]
    dep(99, at(2026, 10, 16)),    // this week, not counted by the recap
  ])
  const r = recap([g], now)
  assert.equal(r.nim, 1500)
  assert.equal(r.daysWithDeposit, 2)
  assert.deepEqual(r.perDay, [true, false, false, false, true, false, false])
  assert.equal(r.start, weekStart(at(2026, 10, 9)))
  // No deposit in the previous week -> null.
  assert.equal(recap([goal([dep(10, at(2026, 10, 16))])], now), null)
})

test('weekKey is the local Monday as YYYY-MM-DD', () => {
  assert.equal(weekKey(at(2026, 10, 20, 15)), '2026-11-16')
  assert.equal(weekKey(at(2026, 10, 16, 0)), '2026-11-16')
})

test('compactNim in the three languages', () => {
  assert.equal(compactNim(950, 'en'), '950')
  assert.equal(compactNim(0, 'en'), '0')
  assert.equal(compactNim(2400, 'en'), '2.4k')
  assert.equal(compactNim(11400, 'en'), '11.4k')
  assert.equal(compactNim(11400, 'fr'), `11,4${NBSP}k`)
  assert.equal(compactNim(11400, 'es'), `11,4${NBSP}k`)
  assert.equal(compactNim(1500000, 'en'), '1.5M')
  assert.equal(compactNim(1500000, 'fr'), `1,5${NBSP}M`)
})

test('an empty goal list gives zeroed numbers and no best week or recap', () => {
  const now = at(2026, 10, 18, 12)
  const r = insights([], now)
  assert.equal(r.total8, 0)
  assert.equal(r.weeksSaved, 0)
  assert.equal(r.goalsCount, 0)
  assert.equal(r.bestWeek, null)
  assert.equal(r.longestRun, 0)
  assert.equal(r.currentRun, 0)
  assert.equal(r.hasAny, false)
  assert.equal(r.weekly.length, 8)
  assert.equal(r.weekStarts.length, 8)
  assert.equal(r.days.length, 56)
  assert.equal(recap([], now), null)
})
