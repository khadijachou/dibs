import { test } from 'node:test'
import assert from 'node:assert/strict'

// A tiny localStorage for node, so the consent rules can be checked without a browser.
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size },
}
const calls = []
globalThis.fetch = async (url, opts) => { calls.push({ url, ...opts }); return { ok: true, status: 204, json: async () => ({}) } }

const { backfillEvents, consent, setConsent, track } = await import('./stats.js')

const now = Date.parse('2026-11-10T12:00:00Z')
const day = (n) => new Date(now - n * 864e5).toISOString()
const HASH = 'a'.repeat(64)
const goal = {
  id: 'g1', brandKey: 'steam', itemId: 'steam-5', usd: 5, itemName: 'Steam', createdAt: day(20), deadline: day(20 - 56),
  deposits: [
    { id: 'dep-1', nim: 100, tx: HASH, at: day(19) },
    { id: 'm1', nim: -10, kind: 'move', at: day(18) },
    { id: 'w1', nim: -90, kind: 'withdraw', at: day(2) },
  ],
  unlockSteps: [{ step: 'deactivate', tx: 'x', at: day(5) }],
  unlockMode: 'withdraw', status: 'withdrawn', payment: null,
}

test('backfill: goal, real deposits, unlock steps; never names, emails or addresses', () => {
  const ev = backfillEvents([goal], now)
  assert.deepEqual(ev.map((e) => e.kind), ['goal_created', 'deposit', 'unlock_step'])
  assert.ok(ev.every((e) => e.backfill === true))
  assert.deepEqual(ev[0].data, { goalId: 'g1', brand: 'steam', itemId: 'steam-5', usd: 5, weeks: 8 })
  assert.deepEqual(ev[1].data, { goalId: 'g1', depositId: 'dep-1', nim: 100, tx: HASH })
  assert.deepEqual(ev[2].data, { goalId: 'g1', step: 'deactivate', mode: 'withdraw' })
  assert.ok(!JSON.stringify(ev).includes('Steam'))
})

test('backfill: purchases carry the payment hash; older than 60 days is left out', () => {
  const bought = { ...goal, id: 'g2', deposits: [], unlockSteps: [], unlockMode: null, status: 'redeemed', payment: { hash: HASH, at: day(1), orderToken: 'secret', redemption: { code: 'CODE' } } }
  const old = { ...goal, id: 'g3', createdAt: day(90), deposits: [], unlockSteps: [] }
  const ev = backfillEvents([bought, old], now)
  assert.deepEqual(ev.map((e) => e.kind), ['goal_created', 'purchase'])
  assert.equal(ev[1].data.tx, HASH)
  assert.ok(!JSON.stringify(ev).includes('secret') && !JSON.stringify(ev).includes('CODE'))
})

test('nothing is queued or sent before Share stats, nor after No thanks', () => {
  assert.equal(consent(), null)
  track('move', { nim: 5 })
  setConsent('no')
  track('move', { nim: 5 })
  assert.equal(localStorage.getItem('dibs.outbox'), null)
  assert.equal(calls.length, 0)
})
