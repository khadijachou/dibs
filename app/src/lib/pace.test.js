import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planOf } from './pace.js'

const DAY = 864e5
const NOW = Date.parse('2026-11-09T12:00:00Z')
// A 10-week goal of 1,000 NIM (100 NIM a week), started `days` ago, holding `saved` NIM.
const goal = (days, saved) => ({
  id: 'g', status: 'saving', targetNim: 1000,
  createdAt: new Date(NOW - days * DAY).toISOString(),
  deadline: new Date(NOW - days * DAY + 70 * DAY).toISOString(),
  deposits: saved ? [{ nim: saved, at: new Date(NOW - days * DAY).toISOString(), tx: 'x' }] : [],
})

test('week 1: lag 0 whatever the amount', () => {
  for (const saved of [0, 1, 50, 100, 500]) assert.equal(planOf(goal(3, saved), NOW).lagWeeks, 0)
})

test('week 2 with nothing saved: one week behind', () => {
  const p = planOf(goal(8, 0), NOW)
  assert.equal(p.lagWeeks, 1)
  assert.equal(p.pace.kind, 'behind')
})

test('week 3 with nothing saved: two weeks behind, late, same fields as behind', () => {
  const p = planOf(goal(15, 0), NOW)
  assert.equal(p.lagWeeks, 2)
  assert.equal(p.pace.kind, 'late')
  assert.equal(p.pace.amount, Math.ceil(1000 / p.weeksLeft))
  assert.ok(p.pace.date instanceof Date)
})

test('caught up: lag 0', () => {
  assert.equal(planOf(goal(15, 200), NOW).lagWeeks, 0)
  assert.equal(planOf(goal(15, 300), NOW).lagWeeks, 0)
})
