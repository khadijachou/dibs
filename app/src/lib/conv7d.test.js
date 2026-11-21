import { test } from 'node:test'
import assert from 'node:assert/strict'
import { downsample, getConv7d, marketChartUrl, parseSeries, pct7d, sparkPoints } from './conv7d.js'

const now = 1_700_000_000_000

test('marketChartUrl asks for the last 7 days in the given currency (lower-cased)', () => {
  assert.match(marketChartUrl('EUR'), /vs_currency=eur/)
  assert.match(marketChartUrl('EUR'), /days=7/)
})

test('parseSeries keeps positive prices (downsampled), or null under two points', () => {
  assert.deepEqual(parseSeries({ prices: [[1, 0.3], [2, 0.31], [3, 0]] }), [0.3, 0.31]) // 0 dropped
  assert.equal(parseSeries({ prices: [[1, 0.3]] }), null)
  assert.equal(parseSeries({}), null)
  assert.equal(parseSeries(null), null)
})

test('downsample keeps the first and last points and at most max', () => {
  const s = Array.from({ length: 100 }, (_, i) => i)
  const d = downsample(s, 10)
  assert.equal(d.length, 10)
  assert.equal(d[0], 0)
  assert.equal(d[d.length - 1], 99)
  assert.deepEqual(downsample([1, 2, 3], 24), [1, 2, 3]) // already small
})

test('pct7d is the first-to-last change, or null', () => {
  assert.ok(Math.abs(pct7d([100, 110]) - 10) < 1e-9)
  assert.ok(Math.abs(pct7d([100, 90]) + 10) < 1e-9)
  assert.equal(pct7d([100]), null)
  assert.equal(pct7d(null), null)
})

test('sparkPoints maps into the box, y inverted', () => {
  const pts = sparkPoints([1, 2, 3], 100, 28).split(' ').map((s) => s.split(',').map(Number))
  assert.equal(pts.length, 3)
  assert.equal(pts[0][0], 0) // first x at the left
  assert.equal(pts[2][0], 100) // last x at the width
  assert.ok(pts[0][1] > pts[2][1]) // a rising series draws upward (y goes down)
  assert.equal(sparkPoints([1], 100, 28), '')
})

function memStore() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

test('getConv7d caches per currency per day: one request each', async () => {
  const storage = memStore()
  let calls = 0
  const fetch = async () => { calls++; return { ok: true, json: async () => ({ prices: [[1, 0.3], [2, 0.33]] }) } }
  assert.deepEqual(await getConv7d('usd', { fetch, storage, now }), [0.3, 0.33])
  assert.deepEqual(await getConv7d('usd', { fetch, storage, now }), [0.3, 0.33]) // from cache
  assert.equal(calls, 1)
  await getConv7d('eur', { fetch, storage, now }) // a second currency asks once more
  assert.equal(calls, 2)
})

test('getConv7d remembers a failure for the day (null, not asked again)', async () => {
  const storage = memStore()
  let calls = 0
  const fetch = async () => { calls++; return { ok: false } }
  assert.equal(await getConv7d('gbp', { fetch, storage, now }), null)
  assert.equal(await getConv7d('gbp', { fetch, storage, now }), null)
  assert.equal(calls, 1)
})

test('getConv7d with no storage resolves null (nothing can be remembered)', async () => {
  assert.equal(await getConv7d('usd', { storage: null, now }), null)
})
