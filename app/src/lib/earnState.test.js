import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeNim, earnState, FIRST_PAYOUT_MS } from './earnState.js'

const L = 100_000
const NOW = Date.parse('2026-11-12T12:00:00Z')
const ago = (ms) => new Date(NOW - ms).toISOString()
const st = (active, inactive = 0, retired = 0) => ({ balance: active * L, inactiveBalance: inactive * L, retiredBalance: retired * L })

test('activeNim: the active stake in NIM, 0 without a staker', () => {
  assert.equal(activeNim(st(250.5)), 250.5)
  assert.equal(activeNim({ activeBalance: 100 * L }), 100)
  assert.equal(activeNim(null), 0)
})

test('earning: active covers the goals, nothing leaving, rewards counted', () => {
  assert.equal(earnState({ st: st(302), inGoals: 300, earned: 2, since: ago(3 * 86_400_000), now: NOW }), 'earning')
  // 0 earned but measured for more than 12 h: no reason to give, stays as today
  assert.equal(earnState({ st: st(300), inGoals: 300, earned: 0, since: ago(FIRST_PAYOUT_MS + 1), now: NOW }), 'earning')
  // no staker, no goal
  assert.equal(earnState({ st: null, inGoals: 0, earned: 0, since: null, now: NOW }), 'earning')
})

test('first: nothing earned yet, measurement started less than 12 h ago', () => {
  assert.equal(earnState({ st: st(150), inGoals: 150, earned: 0, since: ago(60_000), now: NOW }), 'first')
  assert.equal(earnState({ st: st(150), inGoals: 150, earned: 0, since: ago(FIRST_PAYOUT_MS - 1), now: NOW }), 'first')
  // something earned already: not first
  assert.equal(earnState({ st: st(150.01), inGoals: 150, earned: 0.01, since: ago(60_000), now: NOW }), 'earning')
  // unknown earned (null): not first
  assert.equal(earnState({ st: st(150), inGoals: 150, earned: null, since: ago(60_000), now: NOW }), 'earning')
})

test('stopped: active stake below the NIM in goals, or NIM leaving staking', () => {
  // Stop staking sent: active lowered under the goals' NIM
  assert.equal(earnState({ st: st(100, 200), inGoals: 300, earned: 1, since: ago(86_400_000), now: NOW }), 'stopped')
  assert.equal(earnState({ st: st(0, 300), inGoals: 300, earned: 0, since: ago(60_000), now: NOW }), 'stopped')
  // retired, waiting for Remove
  assert.equal(earnState({ st: st(0, 0, 300), inGoals: 300, earned: 3, since: ago(86_400_000), now: NOW }), 'stopped')
  // active under the goals with nothing inactive (ledger ahead of the chain)
  assert.equal(earnState({ st: st(200), inGoals: 300, earned: 0, since: ago(86_400_000), now: NOW }), 'stopped')
  // stopped wins over first
  assert.equal(earnState({ st: st(0, 150), inGoals: 150, earned: 0, since: ago(60_000), now: NOW }), 'stopped')
  // one luna of rounding is not "stopped"
  assert.equal(earnState({ st: { balance: 29_999_998 }, inGoals: 300, earned: 1, since: ago(86_400_000), now: NOW }), 'stopped')
  assert.equal(earnState({ st: { balance: 29_999_999 }, inGoals: 300, earned: 1, since: ago(86_400_000), now: NOW }), 'earning')
})
