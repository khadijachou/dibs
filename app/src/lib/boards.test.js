// Leaderboards client (lib/boards.js): join/leave and read the two boards. Since v1.7.12 the app no longer reports
// deposits, so no transaction hash ever leaves the phone. The signed request path is exercised with a fake storage and
// a fetch spy, like friends.test.js.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ed25519 } from '@noble/curves/ed25519.js'
import { config } from './config.js'
import * as boards from './boards.js'
import { refreshBoards, setBoards, clearQueue, getBoardsState, globalBoard } from './boards.js'

const hex = (u8) => Buffer.from(u8).toString('hex')
function fakeStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

let fetchCalls, responses
beforeEach(() => {
  globalThis.localStorage = fakeStorage()
  config.friendsUrl = 'http://friends.test'
  fetchCalls = []
  responses = []
  globalThis.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null
    fetchCalls.push({ url: String(url), body })
    const r = responses.length ? responses.shift() : { ok: true }
    return { status: 200, ok: true, json: async () => r }
  }
  const sk = ed25519.utils.randomSecretKey()
  localStorage.setItem('dibs.friends.key', hex(sk))
  localStorage.setItem('dibs.friends', JSON.stringify({ on: true, id: 'u1', code: 'DIBS-ABCD', name: 'A' }))
})

test('the deposit-reporting surface is gone: no hash ever leaves the phone', () => {
  // Every function that used to send a transaction hash was removed in v1.7.12.
  for (const name of ['queueDeposit', 'queueMonthDeposits', 'flushQueue', 'linkDepositAddress', 'lastReason', 'walletsLinked', 'onGlobal']) {
    assert.equal(boards[name], undefined, `${name} should be removed`)
  }
})

test('after a mock deposit landing, nothing is reported to the server', async () => {
  // v1.7.11 ran queueDeposit(hash) here; v1.7.12 reports nothing. Even with a leftover queue, no deposit POST happens.
  localStorage.setItem('dibs.boards', JSON.stringify({ friends: false, global: true }))
  localStorage.setItem('dibs.boardsQueue', JSON.stringify([{ tx: 'a'.repeat(64), at: Date.now() }]))
  // Simulate the launch path: clear any leftover queue. (Goal.jsx no longer calls into boards.js at all.)
  clearQueue()
  assert.equal(localStorage.getItem('dibs.boardsQueue'), null, 'the leftover queue is cleared once')
  assert.equal(fetchCalls.some((c) => c.url.includes('/v1/me/xp/deposit')), false, 'no deposit report is sent')
})

test('refreshBoards mirrors the server board choice locally', async () => {
  responses = [{ boards: { friends: true, global: false } }] // the GET /v1/me answer
  await refreshBoards()
  assert.deepEqual(getBoardsState(), { friends: true, global: false })
})

test('setBoards posts the choice and mirrors it; it never reports a deposit', async () => {
  localStorage.setItem('dibs.boards', JSON.stringify({ friends: false, global: false }))
  localStorage.setItem('dibs.boardsQueue', JSON.stringify([{ tx: 'b'.repeat(64), at: Date.now() }]))
  responses = [{ boards: { friends: false, global: true } }]
  await setBoards({ friends: false, global: true })
  assert.deepEqual(getBoardsState(), { friends: false, global: true })
  // Joining no longer flushes a deposit queue, so the only call is the board PUT.
  assert.equal(fetchCalls.length, 1)
  assert.ok(fetchCalls[0].url.includes('/v1/me/boards'))
  assert.equal(fetchCalls.some((c) => c.url.includes('/v1/me/xp/deposit')), false)
})

test('globalBoard reads the Global board', async () => {
  responses = [{ board: 'global', count: 0, top: [], me: null }]
  const d = await globalBoard()
  assert.equal(d.board, 'global')
  assert.ok(fetchCalls[0].url.includes('/v1/boards/global'))
})
