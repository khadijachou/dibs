import { test } from 'node:test'
import assert from 'node:assert/strict'
import { idleNim, monthlyEstimate, showIdleCard } from './idleEarn.js'

const DAY = 864e5
const now = 1_700_000_000_000

test('idleNim is the balance minus the gap, never below 0', () => {
  assert.equal(idleNim(1000, 300), 700)
  assert.equal(idleNim(1000, null), 1000) // no gap counts as 0
  assert.equal(idleNim(100, 500), 0) // the gap counts more than the balance
  assert.equal(idleNim(null, 0), 0) // balance unknown (loading) counts as 0: the card stays hidden
})

test('monthlyEstimate projects this wallet own daily rate to 30 days', () => {
  // 10 NIM earned on 1,000 NIM in goals over 10 days = 0.001 NIM per NIM per day. 5,000 idle -> 5000*0.001*30 = 150.
  const since = new Date(now - 10 * DAY).toISOString()
  const n = monthlyEstimate({ earned: 10, inGoals: 1000, since, idle: 5000, now })
  assert.ok(Math.abs(n - 150) < 1e-6, String(n))
})

test('monthlyEstimate is null when it cannot be computed', () => {
  const since = new Date(now - 10 * DAY).toISOString()
  assert.equal(monthlyEstimate({ earned: 10, inGoals: 1000, since, idle: 0, now }), null, 'no idle NIM')
  assert.equal(monthlyEstimate({ earned: 10, inGoals: 0, since, idle: 5000, now }), null, 'no stake yet')
  assert.equal(monthlyEstimate({ earned: null, inGoals: 1000, since, idle: 5000, now }), null, 'earned null')
  assert.equal(monthlyEstimate({ earned: 0, inGoals: 1000, since, idle: 5000, now }), null, 'nothing earned yet')
  const since1h = new Date(now - 3_600_000).toISOString()
  assert.equal(monthlyEstimate({ earned: 10, inGoals: 1000, since: since1h, idle: 5000, now }), null, 'under one day of data')
  assert.equal(monthlyEstimate({ earned: 10, inGoals: 1000, since: null, idle: 5000, now }), null, 'no since')
})

test('showIdleCard: hidden at 0, and under 100 NIM when there is no staker yet', () => {
  assert.equal(showIdleCard({ idle: 0, hasStaker: true }), false)
  assert.equal(showIdleCard({ idle: 50, hasStaker: false }), false) // under 100 and could not open a staker
  assert.equal(showIdleCard({ idle: 50, hasStaker: true }), true) // a staker exists: any idle NIM shows
  assert.equal(showIdleCard({ idle: 150, hasStaker: false }), true) // 100 NIM or more can open a staker
})
