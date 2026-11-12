import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeNim, earnState, leavingNim, FIRST_PAYOUT_MS } from './earnState.js'

const L = 100_000
const NOW = Date.parse('2026-11-12T12:00:00Z')
const ago = (ms) => new Date(NOW - ms).toISOString()
const st = (active, inactive = 0, retired = 0) => ({ balance: active * L, inactiveBalance: inactive * L, retiredBalance: retired * L })
const old = ago(3 * 86_400_000)

test('activeNim: the active stake in NIM, 0 without a staker', () => {
  assert.equal(activeNim(st(250.5)), 250.5)
  assert.equal(activeNim({ activeBalance: 100 * L }), 100)
  assert.equal(activeNim(null), 0)
})

test('leavingNim: inactive + retired on chain, or the unlocking goals, whichever is larger (never both)', () => {
  assert.equal(leavingNim(st(2_665, 11_753)), 11_753)
  assert.equal(leavingNim(st(100, 200, 300)), 500)
  assert.equal(leavingNim(st(800), 500), 500) // Stop staking not confirmed yet: the goal's NIM
  assert.equal(leavingNim(st(300, 500), 500), 500) // same NIM, not 1,000
  assert.equal(leavingNim(null), 0)
})

test('earning: active stake, nothing leaving, rewards counted', () => {
  assert.equal(earnState({ st: st(302), inGoals: 300, earned: 2, since: old, now: NOW }), 'earning')
  // 0 earned but measured for more than 12 h: no reason to give, stays as today
  assert.equal(earnState({ st: st(300), inGoals: 300, earned: 0, since: ago(FIRST_PAYOUT_MS + 1), now: NOW }), 'earning')
  // no staker, no goal
  assert.equal(earnState({ st: null, inGoals: 0, earned: 0, since: null, now: NOW }), 'earning')
  // active under the goals with nothing leaving (ledger ahead of the chain): not stopped any more
  assert.equal(earnState({ st: st(200), inGoals: 300, earned: 0, since: old, now: NOW }), 'earning')
})

test('first: nothing earned yet, measurement started less than 12 h ago', () => {
  assert.equal(earnState({ st: st(150), inGoals: 150, earned: 0, since: ago(60_000), now: NOW }), 'first')
  assert.equal(earnState({ st: st(150), inGoals: 150, earned: 0, since: ago(FIRST_PAYOUT_MS - 1), now: NOW }), 'first')
  assert.equal(earnState({ st: st(150.01), inGoals: 150, earned: 0.01, since: ago(60_000), now: NOW }), 'earning')
  assert.equal(earnState({ st: st(150), inGoals: 150, earned: null, since: ago(60_000), now: NOW }), 'earning')
})

test('partial: active above 0 and some NIM leaving (inactive, retired or an unlocking goal)', () => {
  // the mainnet case: 2,665 active, 11,753 unlocking
  const s = st(2_665, 11_753)
  assert.equal(earnState({ st: s, inGoals: 14_418, earned: 5, since: old, now: NOW }), 'partial')
  assert.equal(leavingNim(s), 11_753)
  assert.equal(earnState({ st: st(300, 0, 500), inGoals: 800, earned: 1, since: old, now: NOW }), 'partial')
  // goal unlocking, Stop staking not on chain yet
  assert.equal(earnState({ st: st(800), inGoals: 800, unlockingNim: 500, earned: 1, since: old, now: NOW }), 'partial')
  // partial wins over first
  assert.equal(earnState({ st: st(150, 150), inGoals: 300, earned: 0, since: ago(60_000), now: NOW }), 'partial')
})

test('stopped: only when the active stake is 0', () => {
  assert.equal(earnState({ st: st(0, 11_753), inGoals: 11_753, earned: 3, since: old, now: NOW }), 'stopped')
  assert.equal(leavingNim(st(0, 11_753)), 11_753)
  assert.equal(earnState({ st: st(0, 0, 300), inGoals: 300, earned: 3, since: old, now: NOW }), 'stopped')
  // stopped wins over first
  assert.equal(earnState({ st: st(0, 150), inGoals: 150, earned: 0, since: ago(60_000), now: NOW }), 'stopped')
  // one luna active is not stopped
  assert.equal(earnState({ st: { balance: 1, inactiveBalance: 300 * L }, inGoals: 300, earned: 1, since: old, now: NOW }), 'partial')
})
