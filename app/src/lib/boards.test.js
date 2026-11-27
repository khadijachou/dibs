// Leaderboards client (lib/boards.js): the deposit queue keeps a reported hash until the server gives a final answer,
// retries not_found_yet at the next launch, and re-queues this month's deposits from the ledger to recover lost ones.
// The signed request path is exercised with a fake storage and a fetch spy, like friends.test.js.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ed25519 } from '@noble/curves/ed25519.js'
import { config } from './config.js'
import { queueMonthDeposits, flushQueue, onGlobal, lastReason } from './boards.js'

const hex = (u8) => Buffer.from(u8).toString('hex')
const H = (c) => c.repeat(64) // a 64-hex transaction hash from one character
function fakeStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}
const queue = () => JSON.parse(localStorage.getItem('dibs.boardsQueue') || '[]')
const setQueue = (arr) => localStorage.setItem('dibs.boardsQueue', JSON.stringify(arr))

let fetchCalls, responses
beforeEach(() => {
  globalThis.localStorage = fakeStorage()
  config.friendsUrl = 'http://friends.test'
  fetchCalls = []
  responses = [] // each entry is the next POST answer, or the string 'throw' to simulate a network error
  globalThis.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null
    fetchCalls.push({ url, tx: body?.tx })
    const r = responses.length ? responses.shift() : { ok: true, reason: 'ok' }
    if (r === 'throw') throw new Error('network down')
    return { status: 200, ok: true, json: async () => r }
  }
  const sk = ed25519.utils.randomSecretKey()
  localStorage.setItem('dibs.friends.key', hex(sk))
  localStorage.setItem('dibs.friends', JSON.stringify({ on: true, id: 'u1', code: 'DIBS-ABCD', name: 'A' }))
  localStorage.setItem('dibs.boards', JSON.stringify({ friends: false, global: true }))
})

test('onGlobal reflects the stored board choice', () => {
  assert.equal(onGlobal(), true)
  localStorage.setItem('dibs.boards', JSON.stringify({ friends: true, global: false }))
  assert.equal(onGlobal(), false)
})

test('not_found_yet keeps the hash queued and records the reason', async () => {
  setQueue([{ tx: H('a'), at: Date.now() }])
  responses = [{ ok: false, reason: 'not_found_yet' }]
  await flushQueue()
  assert.equal(queue().length, 1, 'still queued for the next launch')
  assert.equal(queue()[0].tx, H('a'))
  assert.equal(lastReason(), 'not_found_yet')
})

test('a counted deposit is dropped from the queue', async () => {
  setQueue([{ tx: H('a'), at: Date.now() }])
  responses = [{ ok: true, reason: 'ok' }]
  await flushQueue()
  assert.equal(queue().length, 0)
  assert.equal(lastReason(), 'ok')
})

test('a final refusal is dropped; a network error is kept for later', async () => {
  setQueue([{ tx: H('a'), at: Date.now() }, { tx: H('b'), at: Date.now() }])
  responses = [{ ok: false, reason: 'wrong_from' }, 'throw'] // a -> wrong_from (final), b -> network error
  await flushQueue()
  const q = queue()
  assert.equal(q.length, 1)
  assert.equal(q[0].tx, H('b'), 'the network error is kept, the refusal dropped')
})

test('a hash older than 3 days is dropped unsent', async () => {
  setQueue([{ tx: H('a'), at: Date.now() - 4 * 864e5 }])
  await flushQueue()
  assert.equal(queue().length, 0)
  assert.equal(fetchCalls.length, 0, 'never sent')
})

test('nothing is sent when the Global board is not joined', async () => {
  localStorage.setItem('dibs.boards', JSON.stringify({ friends: true, global: false }))
  setQueue([{ tx: H('a'), at: Date.now() }])
  await flushQueue()
  assert.equal(fetchCalls.length, 0)
  assert.equal(queue().length, 1, 'kept until the Global board is joined')
})

// Dates that are robustly in this UTC month and last month, whatever day the test runs.
const firstOfThisMonth = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12) }
const iso = (ms) => new Date(ms).toISOString()

test('queueMonthDeposits reports this month\'s real deposits once, recovering an old one; the server dedupes', async () => {
  const now = Date.now()
  const thisMonth = firstOfThisMonth() // older than 3 days by mid-month, but recovered with a fresh queue timestamp
  const lastMonth = firstOfThisMonth() - 2 * 864e5
  const goals = [
    { deposits: [
      { nim: 100, tx: H('a'), at: iso(thisMonth) }, // real, this month (and old): recovered
      { nim: 50, tx: H('a'), at: iso(thisMonth + 864e5) }, // same hash again: deduped in the queue
      { nim: 50, kind: 'move', tx: H('b'), at: iso(now) }, // a move is not a deposit
      { nim: -10, kind: 'withdraw', tx: H('c'), at: iso(now) }, // a withdrawal is not a deposit
      { nim: 20, at: iso(now) }, // no tx hash
      { nim: 30, tx: H('d'), at: iso(lastMonth) }, // last month
    ] },
    { deposits: [{ nim: 200, tx: H('e'), at: iso(thisMonth + 2 * 864e5) }] }, // real, this month
  ]
  responses = [{ ok: false, reason: 'duplicate' }, { ok: false, reason: 'duplicate' }]
  await queueMonthDeposits(goals, now)
  const sent = fetchCalls.map((c) => c.tx).sort()
  assert.deepEqual(sent, [H('a'), H('e')].sort(), 'only the two real this-month deposits, each once')
  assert.equal(queue().length, 0, 'the server answered duplicate, so they are dropped (counted only once)')
  assert.equal(lastReason(), 'duplicate')
})
