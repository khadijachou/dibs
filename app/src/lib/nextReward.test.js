// Next reward time (lib/nextReward.js): the next epoch boundary plus the observed pool payout delay. Pure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextRewardAt, POOL_PAYOUT_DELAY_MS as DELAY } from './nextReward.js'
import { BLOCK_MS, EPOCH } from './release.js'

const NOW = 1_000_000

test('mid-epoch: the next boundary time plus the pool delay', () => {
  const block = EPOCH + Math.floor(EPOCH / 2) // well past the delay window, inside the second epoch
  const toBoundary = (2 * EPOCH - block) * BLOCK_MS
  assert.equal(nextRewardAt(block, NOW), NOW + toBoundary + DELAY)
})

test('10 minutes after a boundary: the just-ended epoch pays 39 minutes from now, not 12 h 39', () => {
  const block = EPOCH + (10 * 60 * 1000) / BLOCK_MS // 10 min past the boundary
  assert.equal(nextRewardAt(block, NOW), NOW + (DELAY - 10 * 60 * 1000))
  assert.equal(nextRewardAt(block, NOW), NOW + 39 * 60 * 1000)
})

test('exactly the delay after a boundary: a full epoch ahead (that payout lands now, so the next one is next)', () => {
  const block = EPOCH + DELAY / BLOCK_MS // sincePrev === DELAY, so we take the next boundary
  // boundary time (NOW - DELAY) + one epoch + the delay == NOW + one epoch
  assert.equal(nextRewardAt(block, NOW), NOW + EPOCH * BLOCK_MS)
})

test('delayMs: 0 gives the old raw boundary behaviour', () => {
  const block = EPOCH + 1000
  assert.equal(nextRewardAt(block, NOW, { delayMs: 0 }), NOW + (2 * EPOCH - block) * BLOCK_MS)
})

test('bad input gives null', () => {
  for (const b of [0, -5, NaN, null, undefined, '12']) assert.equal(nextRewardAt(b, NOW), null, String(b))
})

test('epoch and blockMs can be overridden (delay isolated to 0)', () => {
  assert.equal(nextRewardAt(50, NOW, { epoch: 100, blockMs: 2, delayMs: 0 }), NOW + 50 * 2)
})
