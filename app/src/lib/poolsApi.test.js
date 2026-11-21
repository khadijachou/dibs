// The live pool list (lib/poolsApi.js): one fetch per session, a 6 s timeout, a 60 s failure cache, and the small copy
// saved without logos. Driven by a fake global.fetch and a fake window.localStorage.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadPools, seenPool, _resetPoolsCache } from './poolsApi.js'
import { sameAddress } from './pools.js'

const GARUDA = 'NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7'
const SIAM = 'NQ38 VK34 DRBL S3CN M9KM 8UJN 9JY2 2KFN VQQH'

const entry = (address, over = {}) => ({
  address, name: '', fee: 0.05, payoutType: 'restake', payoutSchedule: 'Every 12 hours',
  isListed: true, score: { dataStatus: 'current' }, logo: 'data:image/png;base64,AAAA', ...over,
})

function fakeWindow() {
  const m = new Map()
  global.window = { localStorage: {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  } }
  return m
}

// A fetch that counts calls and returns a JSON body.
function okFetch(body, counter) {
  return async () => { counter.n++; return { ok: true, status: 200, json: async () => body } }
}

beforeEach(() => { _resetPoolsCache(); fakeWindow() })

test('success: returns the pickable pools in the fixed order', async () => {
  const counter = { n: 0 }
  global.fetch = okFetch([entry(SIAM, { payoutSchedule: 'Every 3 hours', fee: 0.03 }), entry(GARUDA)], counter)
  const pools = await loadPools()
  assert.deepEqual(pools.map((p) => p.name), ['Garuda Pool', 'Siam Pool'])
  assert.equal(counter.n, 1)
})

test('only one call for two callers (shared promise and session cache)', async () => {
  const counter = { n: 0 }
  global.fetch = okFetch([entry(GARUDA)], counter)
  const [a, b] = await Promise.all([loadPools(), loadPools()])
  assert.equal(a, b)
  const c = await loadPools() // after settle: still cached
  assert.equal(c, a)
  assert.equal(counter.n, 1)
})

test('the saved copy has fee and hours but no logo', async () => {
  const counter = { n: 0 }
  global.fetch = okFetch([entry(GARUDA), entry(SIAM, { payoutSchedule: 'Every 3 hours', fee: 0.03 })], counter)
  await loadPools()
  const seen = seenPool(SIAM)
  assert.deepEqual(seen, { address: SIAM, fee: 0.03, hours: 3 })
  assert.ok(!('logo' in seen))
  const raw = JSON.parse(global.window.localStorage.getItem('dibs.poolsSeen'))
  assert.ok(raw.pools.every((p) => !('logo' in p)))
})

test('a malformed body still yields the default pool (pickable never throws on junk)', async () => {
  const counter = { n: 0 }
  global.fetch = okFetch({ nope: true }, counter)
  const pools = await loadPools()
  assert.deepEqual(pools.map((p) => p.name), ['Garuda Pool'])
})

test('a body with only two of the five gives those two plus the default', async () => {
  const counter = { n: 0 }
  // Mint and Siam listed; the default (Garuda) is added even though the service did not list it.
  const MINT = 'NQ53 M1NT S3JD TAGM CBTK 01PX YD3U B1DE GYHB'
  global.fetch = okFetch([entry(MINT, { payoutSchedule: 'Every 3 hours' }), entry(SIAM, { payoutSchedule: 'Every 3 hours', fee: 0.03 })], counter)
  const pools = await loadPools()
  assert.deepEqual(pools.map((p) => p.name), ['Garuda Pool', 'Mint Pool', 'Siam Pool'])
})

test('a timeout (abort) rejects, and the failure is cached for 60 s (no second call)', async () => {
  const counter = { n: 0 }
  global.fetch = async (_url, { signal }) => {
    counter.n++
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e) })
    })
  }
  await assert.rejects(loadPools())
  await assert.rejects(loadPools()) // within 60 s: served from the failure cache, not a new request
  assert.equal(counter.n, 1)
})

test('an HTTP error rejects', async () => {
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) })
  await assert.rejects(loadPools())
})
