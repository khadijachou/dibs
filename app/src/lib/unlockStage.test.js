import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirms, stageOf } from './unlockStage.js'

const L = 100_000 // luna per NIM
const st = (active, inactive, retired, extra = {}) => ({ balance: active * L, inactiveBalance: inactive * L, retiredBalance: retired * L, ...extra })

test('mainnet case (block ~66,418,000): inactive 22,801, retired 0 -> step 2 next, never step 3', () => {
  const s = stageOf(st(0, 22_801, 0, { inactiveFrom: 66_441_600 }), 22_801)
  assert.deepEqual(s, { current: 'retire', done: ['deactivate'] })
})

test('active only -> step 1; retired covering -> step 3', () => {
  assert.equal(stageOf(st(500, 0, 0), 500).current, 'deactivate')
  assert.deepEqual(stageOf(st(0, 0, 500), 500), { current: 'remove', done: ['deactivate', 'retire'] })
})

test('step 3 is never next while retired is short of the goal', () => {
  for (const retired of [0, 1, 499]) assert.notEqual(stageOf(st(0, 500 - retired, retired), 500).current, 'remove')
})

test('other goals still staked do not count as this goal being unlocked', () => {
  assert.equal(stageOf(st(900, 0, 0), 300).current, 'deactivate')
  assert.equal(stageOf(st(600, 300, 0), 300).current, 'retire')
})

test('no staker, or nothing to unlock: no step offered', () => {
  assert.equal(stageOf(null, 500).current, null)
  assert.equal(stageOf(st(0, 0, 0), 0).current, null)
})

test('a sent step only counts once the next read shows it', () => {
  // retire sent but refused by the chain (the mainnet bug): still inactive -> not confirmed
  assert.equal(confirms({ step: 'retire' }, st(0, 22_801, 0), 22_801), false)
  assert.equal(confirms({ step: 'retire' }, st(0, 0, 22_801), 22_801), true)
  assert.equal(confirms({ step: 'deactivate' }, st(500, 0, 0), 500), false)
  assert.equal(confirms({ step: 'deactivate' }, st(0, 500, 0), 500), true)
  // remove: the retired balance must drop by the goal's amount
  assert.equal(confirms({ step: 'remove', retiredBefore: 500 * L }, st(0, 0, 500), 500), false)
  assert.equal(confirms({ step: 'remove', retiredBefore: 500 * L }, st(0, 0, 0), 500), true)
  assert.equal(confirms({ step: 'remove', retiredBefore: 500 * L }, null, 500), true)
})
