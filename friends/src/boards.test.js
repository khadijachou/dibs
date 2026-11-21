// Leaderboards: the deposit-XP rules (countDeposit) checked case by case, plus the routes end to end with a mocked RPC.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { createMemoryStore } from './store.js'
import { makeApp } from './index.js'
import { walletKey, addressOf } from './crypto.js'
import { countDeposit, setBoards, boardsChoice, joinedAtMs, makeChecker, monthOf } from './boards.js'

const STAKING = 'NQ77 0000 0000 0000 0000 0000 0000 0000 0001'
const toHex = (u8) => Buffer.from(u8).toString('hex')
const utf8 = (s) => new Uint8Array(Buffer.from(String(s), 'utf8'))
const concat = (...ps) => { const n = ps.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of ps) { o.set(p, i); i += p.length } return o }
const sha256hex = (s) => toHex(sha256(utf8(s)))
const newKey = () => { const sk = ed25519.utils.randomSecretKey(); return { sk, pub: toHex(ed25519.getPublicKey(sk)) } }
const space4 = (a) => a.replace(/(.{4})(?=.)/g, '$1 ') // the RPC returns addresses with spaces; the server strips them

// A wallet address with no spaces, and the matching walletKey the server stores.
const ADDR = 'NQ11AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH'
const WK = walletKey(ADDR)
const ms = (iso) => Date.parse(iso)

// A deposit tx data object as getTransactionByHash returns it (from with spaces, to the staking contract).
const depTx = (nim, iso, { from = space4(ADDR), to = STAKING, ok = true } = {}) =>
  ({ executionResult: ok, from, to, value: nim * 100_000, timestamp: ms(iso) })

const user = (over = {}) => ({ id: 'u1', wk: WK, boards: { friends: '2026-11-01T00:00:00.000Z' }, ...over })
const NOW = ms('2026-11-15T12:00:00Z')

// ---- countDeposit rules -------------------------------------------------------------------------------------

test('counts a valid deposit: 10 XP, and remembers the NIM', async () => {
  const s = createMemoryStore()
  const u = user()
  const r = await countDeposit(s, u, 'a'.repeat(64), depTx(50, '2026-11-10T09:00:00Z'), NOW)
  assert.equal(r.counted, true)
  assert.equal(r.xp, 10)
  const rec = await s.get(`fr:xp:u1:2026-11`)
  assert.equal(rec.xp, 10)
  assert.equal(rec.nim, 50)
  assert.equal(rec.days['2026-11-10'], 1)
})

test('5 XP per 1,000 NIM crossed, cumulatively over the month', async () => {
  const s = createMemoryStore()
  const u = user()
  // 600 then 600: crosses 1,000 once on the second -> 10 + (10 + 5).
  const a = await countDeposit(s, u, 'a'.repeat(64), depTx(600, '2026-11-02T09:00:00Z'), NOW)
  const b = await countDeposit(s, u, 'b'.repeat(64), depTx(600, '2026-11-03T09:00:00Z'), NOW)
  assert.equal(a.xp, 10)
  assert.equal(b.xp, 15)
  // A single 2,500 NIM deposit crosses twice: 10 + 5*2.
  const s2 = createMemoryStore()
  const c = await countDeposit(s2, user(), 'c'.repeat(64), depTx(2500, '2026-11-02T09:00:00Z'), NOW)
  assert.equal(c.xp, 20)
})

test('a deposit from another wallet does not count', async () => {
  const s = createMemoryStore()
  const r = await countDeposit(s, user(), 'a'.repeat(64), depTx(50, '2026-11-10T09:00:00Z', { from: space4('NQ99ZZZZ') }), NOW)
  assert.equal(r.counted, false)
  assert.equal(r.reason, 'wrong_from')
})

test('a deposit to another address does not count', async () => {
  const s = createMemoryStore()
  const r = await countDeposit(s, user(), 'a'.repeat(64), depTx(50, '2026-11-10T09:00:00Z', { to: 'NQ00 0000' }), NOW)
  assert.equal(r.counted, false)
  assert.equal(r.reason, 'wrong_to')
})

test('a not-executed transaction does not count', async () => {
  const s = createMemoryStore()
  const r = await countDeposit(s, user(), 'a'.repeat(64), depTx(50, '2026-11-10T09:00:00Z', { ok: false }), NOW)
  assert.equal(r.counted, false)
  assert.equal(r.reason, 'not_executed')
})

test('a deposit before the user joined does not count', async () => {
  const s = createMemoryStore()
  const u = user({ boards: { friends: '2026-11-12T00:00:00.000Z' } })
  const r = await countDeposit(s, u, 'a'.repeat(64), depTx(50, '2026-11-10T09:00:00Z'), NOW)
  assert.equal(r.counted, false)
  assert.equal(r.reason, 'before_join')
})

test('a deposit from last month does not count', async () => {
  const s = createMemoryStore()
  const u = user({ boards: { friends: '2026-10-01T00:00:00.000Z' } })
  const r = await countDeposit(s, u, 'a'.repeat(64), depTx(50, '2026-10-20T09:00:00Z'), NOW)
  assert.equal(r.counted, false)
  assert.equal(r.reason, 'not_this_month')
})

test('the 4th counted deposit of a UTC day does not count', async () => {
  const s = createMemoryStore()
  const u = user()
  for (let i = 0; i < 3; i++) {
    const r = await countDeposit(s, u, String(i).repeat(64), depTx(10, '2026-11-10T09:00:00Z'), NOW)
    assert.equal(r.counted, true, `deposit ${i}`)
  }
  const fourth = await countDeposit(s, u, 'z'.repeat(64), depTx(10, '2026-11-10T20:00:00Z'), NOW)
  assert.equal(fourth.counted, false)
  assert.equal(fourth.reason, 'day_cap')
  // The next UTC day is fine again.
  const nextDay = await countDeposit(s, u, 'y'.repeat(64), depTx(10, '2026-11-11T01:00:00Z'), NOW)
  assert.equal(nextDay.counted, true)
})

test('the same transaction counts only once', async () => {
  const s = createMemoryStore()
  const u = user()
  const a = await countDeposit(s, u, 'd'.repeat(64), depTx(50, '2026-11-10T09:00:00Z'), NOW)
  const b = await countDeposit(s, u, 'd'.repeat(64), depTx(50, '2026-11-10T09:00:00Z'), NOW)
  assert.equal(a.counted, true)
  assert.equal(b.counted, false)
  assert.equal(b.reason, 'duplicate')
})

test('a user on no board does not count', async () => {
  const s = createMemoryStore()
  const r = await countDeposit(s, user({ boards: {} }), 'a'.repeat(64), depTx(50, '2026-11-10T09:00:00Z'), NOW)
  assert.equal(r.counted, false)
  assert.equal(r.reason, 'not_on_board')
})

// ---- setBoards / joinedAt -----------------------------------------------------------------------------------

test('joining sets joinedAt once; leaving removes it, rejoining sets a new one', async () => {
  const s = createMemoryStore()
  const u = { id: 'u1', wk: WK }
  await setBoards(s, u, { friends: true, global: false }, ms('2026-11-01T00:00:00Z'))
  assert.equal(u.boards.friends, '2026-11-01T00:00:00.000Z')
  assert.equal(boardsChoice(u).global, false)
  assert.ok(await s.sismember('fr:board:friends', 'u1'))
  // Staying on keeps the original joinedAt.
  await setBoards(s, u, { friends: true, global: true }, ms('2026-11-05T00:00:00Z'))
  assert.equal(u.boards.friends, '2026-11-01T00:00:00.000Z')
  assert.equal(u.boards.global, '2026-11-05T00:00:00.000Z')
  // Leaving friends removes membership; rejoining later sets a new time.
  await setBoards(s, u, { friends: false, global: true }, ms('2026-11-06T00:00:00Z'))
  assert.equal(u.boards.friends, undefined)
  assert.ok(!(await s.sismember('fr:board:friends', 'u1')))
  await setBoards(s, u, { friends: true, global: true }, ms('2026-11-10T00:00:00Z'))
  assert.equal(u.boards.friends, '2026-11-10T00:00:00.000Z')
  assert.equal(joinedAtMs(u), ms('2026-11-05T00:00:00Z')) // earliest active join (global)
})

// ---- routes, end to end with a mocked RPC -------------------------------------------------------------------

let ipN = 0
const nimiqHash = (message) => { const m = utf8(message); return sha256(concat(Uint8Array.of(0x16), utf8('Nimiq Signed Message:\n'), utf8(String(m.length)), m)) }
async function register(a, { dev = newKey(), wallet = newKey() } = {}) {
  const t = new Date().toISOString()
  const message = `Dibs Friends: link this wallet\nDevice: ${dev.pub}\nTime: ${t}`
  const sig = toHex(ed25519.sign(nimiqHash(message), wallet.sk))
  const body = { name: 'Tester', devicePub: dev.pub, wallet: { message, publicKey: wallet.pub, signature: sig } }
  const res = await a.request('/v1/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${ipN++ >> 8}.${ipN & 255}` }, body: JSON.stringify(body) })
  return { ...(await res.json()), dev, wallet }
}
function signed(dev, id, method, path, bodyText) {
  const ts = Date.now(); const nonce = toHex(randomBytes(16))
  const canonical = `${method}\n${path}\n${ts}\n${nonce}\n${sha256hex(bodyText || '')}`
  const sig = toHex(ed25519.sign(utf8(canonical), dev.sk))
  return { 'X-Dibs-Id': id, 'X-Dibs-Ts': String(ts), 'X-Dibs-Nonce': nonce, 'X-Dibs-Sig': sig }
}
async function call(a, who, method, path, bodyObj) {
  const bodyText = bodyObj === undefined ? '' : JSON.stringify(bodyObj)
  const headers = signed(who.dev, who.id, method, path, bodyText)
  const init = { method, headers }
  if (method !== 'GET') { headers['content-type'] = 'application/json'; init.body = bodyText }
  const res = await a.request(path, init)
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function befriend(a, x, y) { // x invites y, y accepts
  const inv = await call(a, x, 'POST', '/v1/invites', { code: y.code })
  await call(a, y, 'POST', `/v1/invites/${inv.body.invite.id}/accept`)
}

// Build an app whose checker reads this store and resolves hashes from a fixed map (mocked RPC).
function appWithChecker(txByHash) {
  const store = createMemoryStore()
  const loadUser = (id) => store.get(`fr:u:${id}`)
  const checker = makeChecker(store, { loadUser, fetchTx: async (h) => txByHash[h] || null })
  const a = makeApp(store, {}, { checker })
  return { a, store, checker }
}

// A deposit tx from a registered user's own wallet (its address derived from the wallet public key, spaced like the RPC).
const depFrom = (who, nim, iso) => depTx(nim, iso, { from: space4(addressOf(who.wallet.pub)) })

test('reporting a deposit requires being on a board, then queues', async () => {
  const hash = 'a'.repeat(64)
  const { a, checker } = appWithChecker({})
  const u = await register(a)
  // Not on a board yet: the report is refused.
  const refused = await call(a, u, 'POST', '/v1/me/xp/deposit', { tx: hash })
  assert.equal(refused.status, 409)
  // A bad hash is rejected.
  await call(a, u, 'PUT', '/v1/me/boards', { friends: false, global: true })
  const bad = await call(a, u, 'POST', '/v1/me/xp/deposit', { tx: 'nope' })
  assert.equal(bad.status, 400)
  // A valid hash queues.
  const ok = await call(a, u, 'POST', '/v1/me/xp/deposit', { tx: hash })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.queued, true)
  assert.equal(checker.pending, 1)
})

test('two users report deposits; both boards read correctly, leaving and deleting take effect', async () => {
  // Four users; the first befriends the other three. Hashes are per user.
  const store = createMemoryStore()
  const loadUser = (id) => store.get(`fr:u:${id}`)
  const txByHash = {}
  const checker = makeChecker(store, { loadUser, fetchTx: async (h) => txByHash[h] || null })
  const a = makeApp(store, {}, { checker })

  const [me, f1, f2, f3] = await Promise.all([register(a), register(a), register(a), register(a)])
  await befriend(a, me, f1)
  await befriend(a, me, f2)
  await befriend(a, me, f3)

  // me + f1 + f2 join both boards; f3 joins nothing.
  for (const u of [me, f1, f2]) await call(a, u, 'PUT', '/v1/me/boards', { friends: true, global: true })

  // Each reports one deposit of a different size, so the ranking is clear. Timestamped after joining (XP from before a
  // join does not count).
  const now = new Date().toISOString()
  const deposits = [[me, 300, 'm'], [f1, 2000, '1'], [f2, 50, '2'], [f3, 9000, '3']]
  for (const [u, nim, c] of deposits) {
    const hash = c.repeat(64)
    txByHash[hash] = depFrom(u, nim, now)
    await call(a, u, 'POST', '/v1/me/xp/deposit', { tx: hash })
  }
  for (let i = 0; i < 10; i++) await checker.tick() // drain the queue

  // Friends board, read by me (I have 3 friends): me, f1, f2 on it (not f3). f1 highest (2000 -> 10 + 5), me (300 -> 10).
  const fb = await call(a, me, 'GET', '/v1/boards/friends')
  assert.equal(fb.status, 200)
  assert.equal(fb.body.count, 2) // two friends on the board (f1, f2); f3 is not
  const fbIds = fb.body.rows.map((r) => r.id)
  assert.ok(fbIds.includes(me.id) && fbIds.includes(f1.id) && fbIds.includes(f2.id))
  assert.ok(!fbIds.includes(f3.id))
  assert.equal(fb.body.rows[0].id, f1.id) // highest XP first
  assert.equal(fb.body.rows[0].place, 1)

  // Global board, read by f2: top carries f3? No, f3 never joined. me, f1, f2 only. f1 highest.
  const gb = await call(a, f2, 'GET', '/v1/boards/global')
  assert.equal(gb.status, 200)
  assert.equal(gb.body.count, 3)
  assert.equal(gb.body.top[0].id, f1.id)
  assert.equal(gb.body.me.id, f2.id)
  assert.ok(gb.body.me.place >= 1)

  // A viewer with fewer than 3 friends gets needFriends.
  const lonely = await register(a)
  await call(a, lonely, 'PUT', '/v1/me/boards', { friends: true, global: false })
  const nf = await call(a, lonely, 'GET', '/v1/boards/friends')
  assert.equal(nf.body.needFriends, true)
  assert.equal(nf.body.friends, 0)

  // f1 leaves the global board: gone from it at once.
  await call(a, f1, 'PUT', '/v1/me/boards', { friends: true, global: false })
  const gb2 = await call(a, me, 'GET', '/v1/boards/global')
  assert.ok(!gb2.body.top.some((r) => r.id === f1.id))
  assert.equal(gb2.body.count, 2)

  // me deletes the profile: off every board, XP record gone.
  await call(a, me, 'DELETE', '/v1/me')
  assert.ok(!(await store.sismember('fr:board:global', me.id)))
  assert.equal(await store.get(`fr:xp:${me.id}:${monthOf(Date.now())}`), null)
})
