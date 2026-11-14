import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dateAgo7, getRate7d, localDay, parseRate7d, RATE7D_KEY } from './rate7d.js'

const mem = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }
}
const okFetch = (usd, calls) => async (url) => { calls.push(url); return { ok: true, json: async () => ({ market_data: { current_price: { usd } } }) } }
const NOW = Date.parse('2026-11-14T12:00:00Z')

test('date 7 days ago in DD-MM-YYYY (UTC), local day in YYYY-MM-DD', () => {
  assert.equal(dateAgo7(NOW), '07-11-2026')
  assert.equal(dateAgo7(Date.parse('2026-03-05T01:00:00Z')), '26-02-2026')
  assert.match(localDay(NOW), /^\d{4}-\d{2}-\d{2}$/)
})

test('parse: a positive number only', () => {
  assert.equal(parseRate7d({ market_data: { current_price: { usd: 0.00027 } } }), 0.00027)
  for (const bad of [null, {}, { market_data: {} }, { market_data: { current_price: {} } }, { market_data: { current_price: { usd: '0.1' } } },
    { market_data: { current_price: { usd: 0 } } }, { market_data: { current_price: { usd: -1 } } }, { market_data: { current_price: { usd: NaN } } }]) {
    assert.equal(parseRate7d(bad), null)
  }
})

test('one request per day, the cached value is reused', async () => {
  const storage = mem(); const calls = []
  assert.equal(await getRate7d({ fetch: okFetch(0.0003, calls), storage, now: NOW }), 0.0003)
  assert.equal(await getRate7d({ fetch: okFetch(0.9, calls), storage, now: NOW + 3600e3 }), 0.0003)
  assert.equal(calls.length, 1)
  assert.ok(calls[0].includes('date=07-11-2026'))
  assert.deepEqual(JSON.parse(storage.m.get(RATE7D_KEY)), { day: localDay(NOW), nimUsd: 0.0003 })
})

test('concurrent calls share one request', async () => {
  const storage = mem(); const calls = []
  const [a, b] = await Promise.all([getRate7d({ fetch: okFetch(0.0002, calls), storage, now: NOW }), getRate7d({ fetch: okFetch(0.0002, calls), storage, now: NOW })])
  assert.equal(a, 0.0002); assert.equal(b, 0.0002); assert.equal(calls.length, 1)
})

test('a failure is stored as null and not retried the same day; a new day asks again', async () => {
  const storage = mem(); const calls = []
  const fail = async (url) => { calls.push(url); throw new Error('net') }
  assert.equal(await getRate7d({ fetch: fail, storage, now: NOW }), null)
  assert.equal(await getRate7d({ fetch: okFetch(0.0003, calls), storage, now: NOW }), null)
  assert.equal(calls.length, 1)
  assert.equal(await getRate7d({ fetch: okFetch(0.0003, calls), storage, now: NOW + 864e5 }), 0.0003)
  assert.equal(calls.length, 2)
})

test('http errors and bad shapes give null', async () => {
  for (const res of [{ ok: false, json: async () => ({}) }, { ok: true, json: async () => ({}) }, { ok: true, json: async () => { throw new Error('x') } },
    { ok: true, json: async () => ({ market_data: { current_price: { usd: 0 } } }) }]) {
    assert.equal(await getRate7d({ fetch: async () => res, storage: mem(), now: NOW }), null)
  }
})

test('storage that throws gives null without throwing', async () => {
  const calls = []
  const badRead = { getItem: () => { throw new Error('blocked') }, setItem: () => {} }
  assert.equal(await getRate7d({ fetch: okFetch(0.0003, calls), storage: badRead, now: NOW }), null)
  const badWrite = { getItem: () => null, setItem: () => { throw new Error('quota') } }
  assert.equal(await getRate7d({ fetch: okFetch(0.0003, calls), storage: badWrite, now: NOW }), null)
  assert.equal(await getRate7d({ fetch: okFetch(0.0003, calls), storage: null, now: NOW }), null)
})
