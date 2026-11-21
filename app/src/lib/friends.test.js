import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { config } from './config.js'
import { registerMessage, canonicalString, request, requestSeq, SEQ_TIMEOUTS, me, getState, isOn, getVis, setPendingCode, getPendingCode, inviteText, visSummary } from './friends.js'

const hex = (u8) => Buffer.from(u8).toString('hex')
const utf8 = (s) => new TextEncoder().encode(String(s))

// Fake storage and a fetch spy, reset before each test.
function fakeStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}
let fetchCalls
beforeEach(() => {
  globalThis.localStorage = fakeStorage()
  config.friendsUrl = 'http://friends.test'
  fetchCalls = []
  globalThis.fetch = async (url, opts) => { fetchCalls.push({ url, opts }); return { status: 200, ok: true, json: async () => ({ ok: true }) } }
})

function seedOn() {
  const sk = ed25519.utils.randomSecretKey()
  const pub = hex(ed25519.getPublicKey(sk))
  localStorage.setItem('dibs.friends.key', hex(sk))
  localStorage.setItem('dibs.friends', JSON.stringify({ on: true, id: 'u1', code: 'DIBS-ABCD', name: 'A', devicePub: pub }))
  return { sk, pub }
}

test('registerMessage: the exact three-line format', () => {
  assert.equal(registerMessage('ab12', '2026-11-21T12:00:00.000Z'), 'Dibs Friends: link this wallet\nDevice: ab12\nTime: 2026-11-21T12:00:00.000Z')
})

test('canonicalString: method, path, ts, nonce, body hash joined by newlines', () => {
  assert.equal(canonicalString('GET', '/v1/me', 1, 'ab', 'cd'), 'GET\n/v1/me\n1\nab\ncd')
})

test('no call when Friends is off', async () => {
  await assert.rejects(() => me(), (e) => e.friendsError === 'NOT_ON')
  assert.equal(fetchCalls.length, 0)
})

test('no call when friendsUrl is empty', async () => {
  seedOn()
  config.friendsUrl = ''
  await assert.rejects(() => me(), (e) => e.friendsError === 'NOT_CONFIGURED')
  assert.equal(fetchCalls.length, 0)
})

test('a signed GET sends a valid device signature over the canonical string', async () => {
  const { pub } = seedOn()
  await me()
  assert.equal(fetchCalls.length, 1)
  const { url, opts } = fetchCalls[0]
  assert.equal(url, 'http://friends.test/v1/me')
  assert.equal(opts.method, 'GET')
  const h = opts.headers
  assert.equal(h['X-Dibs-Id'], 'u1')
  assert.match(h['X-Dibs-Nonce'], /^[0-9a-f]{32}$/)
  const bodyHash = hex(sha256(utf8('')))
  const canonical = canonicalString('GET', '/v1/me', Number(h['X-Dibs-Ts']), h['X-Dibs-Nonce'], bodyHash)
  assert.equal(ed25519.verify(Buffer.from(h['X-Dibs-Sig'], 'hex'), utf8(canonical), Buffer.from(pub, 'hex')), true)
})

test('a signed POST hashes the exact body', async () => {
  const { pub } = seedOn()
  await request('POST', '/v1/invites', { code: 'DIBS-WXYZ' })
  const { opts } = fetchCalls[0]
  assert.equal(opts.body, JSON.stringify({ code: 'DIBS-WXYZ' }))
  const h = opts.headers
  const canonical = canonicalString('POST', '/v1/invites', Number(h['X-Dibs-Ts']), h['X-Dibs-Nonce'], hex(sha256(utf8(opts.body))))
  assert.equal(ed25519.verify(Buffer.from(h['X-Dibs-Sig'], 'hex'), utf8(canonical), Buffer.from(pub, 'hex')), true)
})

test('401 sets on:false locally and throws UNAUTHORIZED, with no loop', async () => {
  seedOn()
  let hits = 0
  globalThis.fetch = async () => { hits++; return { status: 401, ok: false, json: async () => ({ error: 'UNAUTHORIZED' }) } }
  await assert.rejects(() => me(), (e) => e.friendsError === 'UNAUTHORIZED' && e.status === 401)
  assert.equal(hits, 1) // called once, no retry
  assert.equal(isOn(), false)
  assert.equal(getState().id, 'u1') // id kept, just off
})

test('a network error or timeout maps to SRV_DOWN', async () => {
  seedOn()
  globalThis.fetch = async (url, opts) => { throw new DOMException('aborted', 'AbortError') } // what the 6 s timeout throws
  await assert.rejects(() => me(), (e) => e.friendsError === 'SRV_DOWN')
})

test('a server error code is passed through', async () => {
  seedOn()
  globalThis.fetch = async () => ({ status: 404, ok: false, json: async () => ({ error: 'BAD_CODE' }) })
  await assert.rejects(() => request('GET', '/v1/lookup?code=DIBS-ZZZZ'), (e) => e.friendsError === 'BAD_CODE' && e.status === 404)
})

test('getVis defaults every item to off; pending code round-trips', () => {
  seedOn()
  assert.deepEqual(getVis(), { avatar: 'off', level: 'off', badges: 'off', totals: 'off', goals: 'off', cards: 'off', wishlist: 'off' })
  setPendingCode('DIBS-ABCD')
  assert.equal(getPendingCode(), 'DIBS-ABCD')
  setPendingCode(null)
  assert.equal(getPendingCode(), null)
})

// ---- the sleeping-server retry sequence (section C) ---------------------------------------------------------
const down = () => { throw new DOMException('aborted', 'AbortError') } // what the timeout abort throws

test('SEQ_TIMEOUTS is 6 s, 15 s, 25 s', () => {
  assert.deepEqual(SEQ_TIMEOUTS, [6000, 15000, 25000])
})

test('requestSeq retries on a slow (SRV_DOWN) answer, then succeeds', async () => {
  seedOn()
  let n = 0
  globalThis.fetch = async () => { n++; if (n < 3) down(); return { status: 200, ok: true, json: async () => ({ friends: [] }) } }
  const out = await requestSeq('GET', '/v1/friends')
  assert.deepEqual(out, { friends: [] })
  assert.equal(n, 3) // two slow tries, then the third answers
})

test('requestSeq gives up after the last timeout', async () => {
  seedOn()
  let n = 0
  globalThis.fetch = async () => { n++; down() }
  await assert.rejects(() => requestSeq('GET', '/v1/friends'), (e) => e.friendsError === 'SRV_DOWN')
  assert.equal(n, SEQ_TIMEOUTS.length) // one try per timeout, no more
})

test('requestSeq does not retry a definite error (401)', async () => {
  seedOn()
  let n = 0
  globalThis.fetch = async () => { n++; return { status: 401, ok: false, json: async () => ({ error: 'UNAUTHORIZED' }) } }
  await assert.rejects(() => requestSeq('GET', '/v1/me'), (e) => e.friendsError === 'UNAUTHORIZED')
  assert.equal(n, 1) // thrown at once, no retry
})

test('the abort timer fires at the given timeout (fake timers)', async (t) => {
  seedOn()
  t.mock.timers.enable({ apis: ['setTimeout'] })
  globalThis.fetch = (url, opts) => new Promise((_, reject) => { opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))) })
  const p = request('GET', '/v1/me', undefined, { timeout: 6000 })
  const assertion = assert.rejects(p, (e) => e.friendsError === 'SRV_DOWN')
  for (let i = 0; i < 20; i++) await Promise.resolve() // let request() load @noble, sign, and arm the abort timer
  t.mock.timers.tick(6000)
  await assertion
})

// ---- pure helpers: inviteText and visSummary (v1.4.1) --------------------------------------------------------
test('inviteText: carries the code and no link', () => {
  const t = (key, vars) => (key === 'frd_share_text' ? `Add me on Dibs. In Dibs go to Profile > Friends > Add by code and type ${vars.code}.` : key)
  const text = inviteText(t, 'DIBS-WXYZ')
  assert.ok(text.includes('DIBS-WXYZ'))
  assert.ok(!text.includes('http'))
  assert.ok(!text.includes('?friend='))
})

test('visSummary: counts the five items not off, ignores unknown keys', () => {
  assert.equal(visSummary({ level: 'off', badges: 'off', cards: 'off', goals: 'off', wishlist: 'off' }).n, 0)
  assert.equal(visSummary({ level: 'friends', badges: 'off', cards: 'off', goals: 'everyone', wishlist: 'off' }).n, 2)
  assert.equal(visSummary({ level: 'everyone', nope: 'everyone', junk: 'friends' }).n, 1)
  assert.equal(visSummary(null).n, 0)
  assert.equal(visSummary({}).n, 0)
})
