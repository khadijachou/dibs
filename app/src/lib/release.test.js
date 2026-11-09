import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocksLeft, clockOf, earliestStepBlockOf, progressOf, releaseAtMs, releaseBlockOf } from './release.js'

// Both cases read on mainnet: inactiveFrom is the next election block after step 1, release is one epoch + 1 later.
test('mainnet 6 Nov: inactiveFrom 66,182,400 releases at 66,225,601', () => {
  assert.equal(66_182_400 % 43_200, 0)
  assert.equal(releaseBlockOf(66_182_400), 66_225_601)
})

test('mainnet 9 Nov: inactiveFrom 66,441,600 releases at 66,484,801', () => {
  assert.equal(66_441_600 % 43_200, 0)
  assert.equal(releaseBlockOf(66_441_600), 66_484_801)
  assert.equal(releaseAtMs(66_441_600, 66_418_000, 0), 66_801 * 1000) // about 18 h 33 min from that read
})

test('mainnet 6 Nov: estimate from the "Stop earning" block is close to the measured 12 h 4 min, never early', () => {
  const stopBlock = 66_181_946
  const waitMs = releaseAtMs(66_182_400, stopBlock, 0)
  assert.equal(waitMs, 43_655 * 1000) // 43,655 blocks at 1 s = 12 h 7.6 min
  const measuredMs = (12 * 60 + 4) * 60_000 // blocks ran at about 0.995 s
  assert.ok(waitMs >= measuredMs)
  assert.ok(waitMs - measuredMs <= measuredMs * 0.01)
})

test('release is always inactiveFrom + 43,201', () => {
  for (const from of [66_182_400, 66_225_600, 66_441_600, 66_484_800]) assert.equal(releaseBlockOf(from) - from, 43_201)
})

test('blocks left: counts down to the release block, then 0, never negative', () => {
  assert.equal(blocksLeft(66_441_600, 66_484_800), 1)
  assert.equal(blocksLeft(66_441_600, 66_484_801), 0)
  assert.equal(blocksLeft(66_441_600, 66_500_000), 0)
})

test('past the release block the wait is 0, never negative', () => {
  assert.equal(releaseAtMs(66_182_400, 66_300_000, 5), 5)
})

test('timer start fallback: the epoch before inactiveFrom, so the 9 Nov step 1 block falls inside the window', () => {
  assert.equal(earliestStepBlockOf(66_441_600), 66_398_400)
})

test('progress: 0 at the start, 1 at the release, clamped outside', () => {
  assert.equal(progressOf(1000, 3000, 1000), 0)
  assert.equal(progressOf(1000, 3000, 2000), 0.5)
  assert.equal(progressOf(1000, 3000, 3000), 1)
  assert.equal(progressOf(1000, 3000, 0), 0)
  assert.equal(progressOf(1000, 3000, 9000), 1)
  assert.equal(progressOf(3000, 3000, 2000), 0)
  assert.equal(progressOf(3000, 3000, 3000), 1)
})

test('clock: hours and minutes rounded up, never 60 minutes', () => {
  assert.deepEqual(clockOf((11 * 60 + 20) * 60_000), { due: false, h: 11, m: 20 })
  assert.deepEqual(clockOf((11 * 60 + 19) * 60_000 + 1), { due: false, h: 11, m: 20 })
  assert.deepEqual(clockOf(59 * 60_000 + 30_000), { due: false, h: 1, m: 0 })
  assert.deepEqual(clockOf(1), { due: false, h: 0, m: 1 })
})

test('clock: time up or past reads as due, never 0 or negative', () => {
  assert.deepEqual(clockOf(0), { due: true })
  assert.deepEqual(clockOf(-90_000), { due: true })
  assert.deepEqual(clockOf(NaN), { due: true })
})
