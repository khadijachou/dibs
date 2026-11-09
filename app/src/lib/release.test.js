import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockOf, releaseAtMs, releaseBlockOf } from './release.js'

test('mainnet case: inactiveFrom 66,182,401 releases at 66,225,601', () => {
  assert.equal(releaseBlockOf(66_182_401), 66_225_601)
  assert.notEqual(releaseBlockOf(66_182_401), 66_182_401)
})

test('mainnet case: estimate from the "Stop earning" block is close to the measured 12 h 4 min, never early', () => {
  const stopBlock = 66_181_946
  const waitMs = releaseAtMs(66_182_401, stopBlock, 0)
  assert.equal(waitMs, 43_655 * 1000) // 43,655 blocks at 1 s = 12 h 7.6 min
  const measuredMs = (12 * 60 + 4) * 60_000 // blocks ran at about 0.995 s
  assert.ok(waitMs >= measuredMs)
  assert.ok(waitMs - measuredMs <= measuredMs * 0.01)
})

test('release block is always after inactiveFrom, within one epoch', () => {
  for (const from of [66_182_400, 66_182_401, 66_200_000, 66_225_599, 66_225_600]) {
    const r = releaseBlockOf(from)
    assert.ok(r > from)
    assert.ok(r - from <= 43_201)
  }
})

test('past the release block the wait is 0, never negative', () => {
  assert.equal(releaseAtMs(66_182_401, 66_300_000, 5), 5)
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
