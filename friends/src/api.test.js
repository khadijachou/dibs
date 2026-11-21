import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { createMemoryStore } from './store.js'
import { makeApp } from './index.js'
import { addressOf, walletKey } from './crypto.js'

const toHex = (u8) => Buffer.from(u8).toString('hex')
const utf8 = (s) => new Uint8Array(Buffer.from(String(s), 'utf8'))
const concat = (...ps) => { const n = ps.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of ps) { o.set(p, i); i += p.length } return o }
const sha256hex = (s) => toHex(sha256(utf8(s)))
const newKey = () => { const sk = ed25519.utils.randomSecretKey(); return { sk, pub: toHex(ed25519.getPublicKey(sk)) } }

const nimiqHash = (message) => { const m = utf8(message); return sha256(concat(Uint8Array.of(0x16), utf8('Nimiq Signed Message:\n'), utf8(String(m.length)), m)) }
const walletSign = (sk, message) => toHex(ed25519.sign(nimiqHash(message), sk))

const app = () => makeApp(createMemoryStore(), {})

let ipN = 0
async function register(a, { name = 'Tester', dev = newKey(), wallet = newKey(), time, ip } = {}) {
  const t = time || new Date().toISOString()
  const message = `Dibs Friends: link this wallet\nDevice: ${dev.pub}\nTime: ${t}`
  const body = { name, devicePub: dev.pub, wallet: { message, publicKey: wallet.pub, signature: walletSign(wallet.sk, message) } }
  const res = await a.request('/v1/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || `10.0.${ipN++ >> 8}.${ipN & 255}` }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => null), dev, wallet }
}

function signedHeaders(dev, id, method, path, bodyText, over = {}) {
  const ts = over.ts ?? Date.now()
  const nonce = over.nonce ?? toHex(randomBytes(16))
  const canonical = `${method}\n${path}\n${ts}\n${nonce}\n${sha256hex(bodyText || '')}`
  const sig = over.sig ?? toHex(ed25519.sign(utf8(canonical), dev.sk))
  return { 'X-Dibs-Id': id, 'X-Dibs-Ts': String(ts), 'X-Dibs-Nonce': nonce, 'X-Dibs-Sig': sig }
}

async function call(a, who, method, path, bodyObj, over = {}) {
  const bodyText = bodyObj === undefined ? '' : JSON.stringify(bodyObj)
  const headers = signedHeaders(who.dev, who.id, method, path, bodyText, over)
  const init = { method, headers }
  if (method !== 'GET') { headers['content-type'] = 'application/json'; init.body = bodyText }
  const res = await a.request(path, init)
  return { status: res.status, body: await res.json().catch(() => null) }
}

const makeUser = async (a, name) => { const r = await register(a, { name }); return { id: r.body.id, dev: r.dev, wallet: r.wallet, code: r.body.code } }

// ---- health ---------------------------------------------------------------------------------------------------

test('health: reports the store and version, no auth', async () => {
  const res = await app().request('/v1/health')
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.store, 'memory')
  assert.ok(body.version)
})

// ---- register / restore ---------------------------------------------------------------------------------------

test('register: creates a user with a DIBS code and all visibility off', async () => {
  const a = app()
  const r = await register(a, { name: ' Aziz ' })
  assert.equal(r.status, 200)
  assert.equal(r.body.restored, false)
  assert.equal(r.body.name, 'Aziz')
  assert.match(r.body.code, /^DIBS-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4,5}$/)
  assert.deepEqual(r.body.visibility, { avatar: 'off', level: 'off', badges: 'off', totals: 'off', goals: 'off', cards: 'off', wishlist: 'off' })
})

test('register restore: a second device on the same wallet keeps id, code and name', async () => {
  const a = app()
  const wallet = newKey()
  const first = await register(a, { name: 'Aziz', wallet })
  const second = await register(a, { name: 'Ignored New Name', wallet, dev: newKey() })
  assert.equal(second.status, 200)
  assert.equal(second.body.restored, true)
  assert.equal(second.body.id, first.body.id)
  assert.equal(second.body.code, first.body.code)
  assert.equal(second.body.name, 'Aziz') // name not overwritten
  // the new device can sign
  const me = await call(a, { id: second.body.id, dev: second.dev }, 'GET', '/v1/me')
  assert.equal(me.status, 200)
})

test('register: a sixth device drops the oldest', async () => {
  const a = app()
  const wallet = newKey()
  const devs = []
  let id
  for (let i = 0; i < 6; i++) { const r = await register(a, { wallet, dev: newKey() }); devs.push(r.dev); id = r.body.id }
  // the first device (index 0) was dropped
  const oldest = await call(a, { id, dev: devs[0] }, 'GET', '/v1/me')
  assert.equal(oldest.status, 401)
  const newest = await call(a, { id, dev: devs[5] }, 'GET', '/v1/me')
  assert.equal(newest.status, 200)
})

test('register: a wrong wallet signature is refused', async () => {
  const a = app()
  const dev = newKey(); const wallet = newKey(); const other = newKey()
  const message = `Dibs Friends: link this wallet\nDevice: ${dev.pub}\nTime: ${new Date().toISOString()}`
  const body = { name: 'X', devicePub: dev.pub, wallet: { message, publicKey: wallet.pub, signature: walletSign(other.sk, message) } }
  const res = await a.request('/v1/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'BAD_WALLET')
})

test('register: an expired Time is refused', async () => {
  const a = app()
  const old = new Date(Date.now() - 20 * 60_000).toISOString()
  const r = await register(a, { time: old })
  assert.equal(r.status, 400)
  assert.equal(r.body.error, 'BAD_WALLET')
})

test('register: the Device line must match devicePub', async () => {
  const a = app()
  const dev = newKey(); const wallet = newKey()
  const message = `Dibs Friends: link this wallet\nDevice: ${newKey().pub}\nTime: ${new Date().toISOString()}`
  const body = { name: 'X', devicePub: dev.pub, wallet: { message, publicKey: wallet.pub, signature: walletSign(wallet.sk, message) } }
  const res = await a.request('/v1/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal(res.status, 400)
})

test('register: a blank name is refused', async () => {
  const a = app()
  const r = await register(a, { name: '   ' })
  assert.equal(r.status, 400)
  assert.equal(r.body.error, 'BAD_NAME')
})

// ---- device signature -----------------------------------------------------------------------------------------

test('device auth: a good signature passes, a tampered one fails', async () => {
  const a = app()
  const u = await makeUser(a, 'Aziz')
  assert.equal((await call(a, u, 'GET', '/v1/me')).status, 200)
  const bad = await call(a, u, 'GET', '/v1/me', undefined, { sig: 'aa'.repeat(64) })
  assert.equal(bad.status, 401)
})

test('device auth: a signature from the wrong key fails', async () => {
  const a = app()
  const u = await makeUser(a, 'Aziz')
  const res = await call(a, { id: u.id, dev: newKey() }, 'GET', '/v1/me')
  assert.equal(res.status, 401)
})

test('device auth: a replayed nonce is refused', async () => {
  const a = app()
  const u = await makeUser(a, 'Aziz')
  const headers = signedHeaders(u.dev, u.id, 'GET', '/v1/me', '')
  const first = await a.request('/v1/me', { method: 'GET', headers })
  assert.equal(first.status, 200)
  const second = await a.request('/v1/me', { method: 'GET', headers })
  assert.equal(second.status, 401)
})

test('device auth: an old timestamp is refused', async () => {
  const a = app()
  const u = await makeUser(a, 'Aziz')
  const res = await call(a, u, 'GET', '/v1/me', undefined, { ts: Date.now() - 6 * 60_000 })
  assert.equal(res.status, 401)
})

test('device auth: a body-tampered request fails (body hash mismatch)', async () => {
  const a = app()
  const u = await makeUser(a, 'Aziz')
  // sign over an empty body but send a real one
  const headers = signedHeaders(u.dev, u.id, 'PATCH', '/v1/me', '')
  headers['content-type'] = 'application/json'
  const res = await a.request('/v1/me', { method: 'PATCH', headers, body: JSON.stringify({ name: 'Hacker' }) })
  assert.equal(res.status, 401)
})

// ---- profile, visibility, shared ------------------------------------------------------------------------------

test('me / shared / visibility: off items are dropped on upload and deleted when turned off', async () => {
  const a = app()
  const u = await makeUser(a, 'Aziz')
  // turn some items on
  await call(a, u, 'PATCH', '/v1/me', { visibility: { level: 'friends', badges: 'everyone', goals: 'friends' } })
  const put = await call(a, u, 'PUT', '/v1/me/shared', {
    level: { level: 12, rank: 'planner' },
    badges: ['first', 'planted'],
    cards: ['steam'], // off -> dropped
    goals: [{ brandKey: 'steam', pct: 40 }],
  })
  assert.equal(put.status, 200)
  assert.equal(put.body.cards, undefined)
  assert.deepEqual(put.body.badges, ['first', 'planted'])
  // now turn badges off: its stored data must be deleted at once
  await call(a, u, 'PATCH', '/v1/me', { visibility: { badges: 'off' } })
  const asFriend = await call(a, u, 'GET', '/v1/me/as-friend')
  assert.equal('badges' in asFriend.body, false)
  assert.ok(asFriend.body.hidden.includes('badges'))
  assert.ok(asFriend.body.hidden.includes('cards'))
  assert.deepEqual(asFriend.body.level, { level: 12, rank: 'planner' })
})

test('me: name, look update; bad name refused', async () => {
  const a = app()
  const u = await makeUser(a, 'Aziz')
  const ok = await call(a, u, 'PATCH', '/v1/me', { name: 'Aziz C', look: { accent: 'coral', frame: 'ring_1' } })
  assert.equal(ok.body.name, 'Aziz C')
  assert.deepEqual(ok.body.look, { accent: 'coral', frame: 'ring_1' })
  const bad = await call(a, u, 'PATCH', '/v1/me', { name: '   ' })
  assert.equal(bad.status, 400)
})

test('users/:id: self, friend and stranger views differ', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  await call(a, other, 'PATCH', '/v1/me', { visibility: { level: 'everyone', badges: 'friends' } })
  await call(a, other, 'PUT', '/v1/me/shared', { level: { level: 3, rank: 'saver' }, badges: ['first'] })
  // stranger
  const asStranger = await call(a, me, 'GET', `/v1/users/${other.id}`)
  assert.deepEqual(asStranger.body, { id: other.id, name: 'Other', seed: other.id })
  // make them friends
  await call(a, me, 'POST', '/v1/invites', { code: other.code })
  await call(a, other, 'POST', '/v1/invites', { code: me.code }) // mutual -> friends
  const asFriend = await call(a, me, 'GET', `/v1/users/${other.id}`)
  assert.deepEqual(asFriend.body.level, { level: 3, rank: 'saver' })
  assert.deepEqual(asFriend.body.badges, ['first'])
})

// ---- lookup ---------------------------------------------------------------------------------------------------

test('lookup: finds by code, hides level unless shared, own and unknown codes error', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  // level not shared yet
  let r = await call(a, me, 'GET', `/v1/lookup?code=${other.code}`)
  assert.equal(r.status, 200)
  assert.equal(r.body.name, 'Other')
  assert.equal(r.body.seed, other.id)
  assert.equal('level' in r.body, false)
  // share level
  await call(a, other, 'PATCH', '/v1/me', { visibility: { level: 'everyone' } })
  await call(a, other, 'PUT', '/v1/me/shared', { level: { level: 8, rank: 'planner' } })
  r = await call(a, me, 'GET', `/v1/lookup?code=${other.code}`)
  assert.equal(r.body.level, 8)
  assert.equal(r.body.rank, 'planner')
  // own code
  assert.equal((await call(a, me, 'GET', `/v1/lookup?code=${me.code}`)).status, 400)
  // unknown
  assert.equal((await call(a, me, 'GET', '/v1/lookup?code=DIBS-ZZZZ')).status, 404)
})

test('lookup: rate limited after 10 a minute', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  for (let i = 0; i < 10; i++) assert.equal((await call(a, me, 'GET', `/v1/lookup?code=${other.code}`)).status, 200)
  assert.equal((await call(a, me, 'GET', `/v1/lookup?code=${other.code}`)).status, 429)
})

// ---- invites and friends --------------------------------------------------------------------------------------

test('invites: accept makes two friends and clears the invite', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  const inv = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  assert.ok(inv.body.invite.id)
  // other sees it as received
  let f = await call(a, other, 'GET', '/v1/friends')
  assert.equal(f.body.invites.length, 1)
  assert.equal(f.body.invites[0].from.name, 'Me')
  // accept
  const acc = await call(a, other, 'POST', `/v1/invites/${inv.body.invite.id}/accept`)
  assert.equal(acc.body.friends, true)
  f = await call(a, other, 'GET', '/v1/friends')
  assert.equal(f.body.invites.length, 0)
  assert.equal(f.body.friends.length, 1)
  assert.equal(f.body.friends[0].id, me.id)
  assert.ok(f.body.friends[0].since)
  const mine = await call(a, me, 'GET', '/v1/friends')
  assert.equal(mine.body.friends.length, 1)
})

test('invites: same direction returns the same invite; already-friends is 409', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  const first = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  const again = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  assert.equal(again.status, 200)
  assert.equal(again.body.invite.id, first.body.invite.id)
  // become friends then try again
  await call(a, other, 'POST', `/v1/invites/${first.body.invite.id}/accept`)
  const dup = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  assert.equal(dup.status, 409)
  assert.equal(dup.body.error, 'ALREADY_FRIENDS')
})

test('invites: opposite directions become friends at once', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  await call(a, me, 'POST', '/v1/invites', { code: other.code })
  const back = await call(a, other, 'POST', '/v1/invites', { code: me.code })
  assert.equal(back.body.friends, true)
  assert.equal((await call(a, me, 'GET', '/v1/friends')).body.friends.length, 1)
  assert.equal((await call(a, other, 'GET', '/v1/friends')).body.friends.length, 1)
})

test('invites: decline is silent; sender still sees it as sent', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  const inv = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  const del = await call(a, other, 'DELETE', `/v1/invites/${inv.body.invite.id}`)
  assert.equal(del.body.ok, true)
  // receiver no longer has it
  assert.equal((await call(a, other, 'GET', '/v1/friends')).body.invites.length, 0)
  // sender still sees it as sent (nothing told to them)
  assert.equal((await call(a, me, 'GET', '/v1/friends')).body.sent.length, 1)
})

test('invites: sender cancel removes it from sent', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  const inv = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  await call(a, me, 'DELETE', `/v1/invites/${inv.body.invite.id}`)
  assert.equal((await call(a, me, 'GET', '/v1/friends')).body.sent.length, 0)
  assert.equal((await call(a, other, 'GET', '/v1/friends')).body.invites.length, 0)
})

test('friends: remove is silent on both sides', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  const inv = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  await call(a, other, 'POST', `/v1/invites/${inv.body.invite.id}/accept`)
  await call(a, me, 'DELETE', `/v1/friends/${other.id}`)
  assert.equal((await call(a, me, 'GET', '/v1/friends')).body.friends.length, 0)
  assert.equal((await call(a, other, 'GET', '/v1/friends')).body.friends.length, 0)
})

test('friends: sharesNothing flag and level when shared', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  const inv = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  await call(a, other, 'POST', `/v1/invites/${inv.body.invite.id}/accept`)
  let row = (await call(a, me, 'GET', '/v1/friends')).body.friends[0]
  assert.equal(row.sharesNothing, true)
  assert.equal('level' in row, false)
  await call(a, other, 'PATCH', '/v1/me', { visibility: { level: 'friends' } })
  await call(a, other, 'PUT', '/v1/me/shared', { level: { level: 4, rank: 'saver' } })
  row = (await call(a, me, 'GET', '/v1/friends')).body.friends[0]
  assert.equal(row.sharesNothing, false)
  assert.equal(row.level, 4)
  assert.equal(row.rank, 'saver')
})

// ---- deletion -------------------------------------------------------------------------------------------------

test('DELETE /v1/me: cleans both sides and frees the code', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  const inv = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  await call(a, other, 'POST', `/v1/invites/${inv.body.invite.id}/accept`)
  await call(a, me, 'DELETE', '/v1/me')
  // other no longer sees me
  assert.equal((await call(a, other, 'GET', '/v1/friends')).body.friends.length, 0)
  // my profile is gone
  assert.equal((await call(a, other, 'GET', `/v1/users/${me.id}`)).status, 404)
  // my code is free (unknown)
  assert.equal((await call(a, other, 'GET', `/v1/lookup?code=${me.code}`)).status, 404)
  // my device can no longer authenticate
  assert.equal((await call(a, me, 'GET', '/v1/me')).status, 401)
})

// ---- privacy --------------------------------------------------------------------------------------------------

test('no response ever contains the wallet address, public key or walletKey', async () => {
  const a = app()
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  await call(a, me, 'PATCH', '/v1/me', { visibility: { level: 'everyone', badges: 'everyone' } })
  await call(a, me, 'PUT', '/v1/me/shared', { level: { level: 5, rank: 'saver' }, badges: ['first'] })
  const inv = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  await call(a, other, 'POST', `/v1/invites/${inv.body.invite.id}/accept`)

  const addr = addressOf(me.wallet.pub)
  const before = process.env.FRIENDS_SALT
  const wk = walletKey(addr) // dev salt, same as the running app in tests
  if (before !== undefined) process.env.FRIENDS_SALT = before

  const bodies = await Promise.all([
    call(a, me, 'GET', '/v1/me'),
    call(a, me, 'GET', '/v1/me/as-friend'),
    call(a, other, 'GET', '/v1/friends'),
    call(a, other, 'GET', `/v1/users/${me.id}`),
    call(a, other, 'GET', `/v1/lookup?code=${me.code}`),
  ])
  for (const r of bodies) {
    const s = JSON.stringify(r.body)
    assert.ok(!s.includes(addr), 'address leaked')
    assert.ok(!s.includes(me.wallet.pub), 'wallet public key leaked')
    assert.ok(!s.includes(wk), 'walletKey leaked')
  }
})

// ---- v1.4.2: avatar, totals, card/goal values -----------------------------------------------------------------
const SVG = 'data:image/svg+xml;base64,' + Buffer.from('<svg>x</svg>').toString('base64')

// Register two users and make them friends; returns both.
async function pair(a) {
  const me = await makeUser(a, 'Me')
  const other = await makeUser(a, 'Other')
  const inv = await call(a, me, 'POST', '/v1/invites', { code: other.code })
  await call(a, other, 'POST', `/v1/invites/${inv.body.invite.id}/accept`)
  return { me, other }
}

test('avatar and totals: shared to a friend only when on; off for a stranger and lookup', async () => {
  const a = app()
  const { me, other } = await pair(a)
  // other turns on avatar + totals and uploads them
  await call(a, other, 'PATCH', '/v1/me', { visibility: { avatar: 'friends', totals: 'friends' } })
  const put = await call(a, other, 'PUT', '/v1/me/shared', { avatar: SVG, totals: { saved: 1234, earned: 56 } })
  assert.equal(put.status, 200)
  assert.equal(put.body.avatar, SVG)
  assert.deepEqual(put.body.totals, { saved: 1234, earned: 56 })
  // a friend sees both
  const asFriend = await call(a, me, 'GET', `/v1/users/${other.id}`)
  assert.equal(asFriend.body.avatar, SVG)
  assert.deepEqual(asFriend.body.totals, { saved: 1234, earned: 56 })
  assert.ok(!asFriend.body.hidden.includes('avatar')) // avatar never a hidden line
  // the friend row carries the avatar
  const row = (await call(a, me, 'GET', '/v1/friends')).body.friends.find((f) => f.id === other.id)
  assert.equal(row.avatar, SVG)
  // a stranger (C) looking other up by code gets no avatar, no totals
  const c = await makeUser(a, 'C')
  const look = await call(a, c, 'GET', `/v1/lookup?code=${other.code}`)
  assert.equal('avatar' in look.body, false)
  assert.equal('totals' in look.body, false)
  const asStranger = await call(a, c, 'GET', `/v1/users/${other.id}`)
  assert.deepEqual(asStranger.body, { id: other.id, name: 'Other', seed: other.id })
})

test('turning avatar/totals off deletes them at once', async () => {
  const a = app()
  const { me, other } = await pair(a)
  await call(a, other, 'PATCH', '/v1/me', { visibility: { avatar: 'friends', totals: 'friends' } })
  await call(a, other, 'PUT', '/v1/me/shared', { avatar: SVG, totals: { saved: 10 } })
  await call(a, other, 'PATCH', '/v1/me', { visibility: { avatar: 'off', totals: 'off' } })
  const p = await call(a, me, 'GET', `/v1/users/${other.id}`)
  assert.equal('avatar' in p.body, false)
  assert.equal('totals' in p.body, false)
  const row = (await call(a, me, 'GET', '/v1/friends')).body.friends.find((f) => f.id === other.id)
  assert.equal('avatar' in row, false)
})

test('cards with values (objects) and old string shape are both accepted', async () => {
  const a = app()
  const { me, other } = await pair(a)
  await call(a, other, 'PATCH', '/v1/me', { visibility: { cards: 'friends', goals: 'friends' } })
  await call(a, other, 'PUT', '/v1/me/shared', {
    cards: ['steam', { brandKey: 'netflix', value: '20 USD' }, { brandKey: 'netflix', value: '20 USD' }],
    goals: [{ brandKey: 'steam', pct: 40, value: '25 EUR' }],
  })
  const p = await call(a, me, 'GET', `/v1/users/${other.id}`)
  assert.deepEqual(p.body.cards, [{ brandKey: 'steam' }, { brandKey: 'netflix', value: '20 USD' }, { brandKey: 'netflix', value: '20 USD' }])
  assert.deepEqual(p.body.goals, [{ brandKey: 'steam', pct: 40, value: '25 EUR' }])
})

test('malformed totals/avatar/value are 400 and store nothing', async () => {
  const a = app()
  const u = await makeUser(a, 'U')
  await call(a, u, 'PATCH', '/v1/me', { visibility: { totals: 'friends', avatar: 'friends', badges: 'friends', cards: 'friends' } })
  // a good upload first, so we can prove a later bad one changes nothing
  await call(a, u, 'PUT', '/v1/me/shared', { badges: ['first'] })
  const bad = [
    { totals: { saved: -1 }, badges: ['second'] },
    { avatar: 'data:image/gif;base64,AAAA' },
    { totals: { earned: 5 } }, // saved missing
    { cards: [{ brandKey: 'steam', value: 'bad<>' }] },
  ]
  for (const b of bad) {
    const r = await call(a, u, 'PUT', '/v1/me/shared', b)
    assert.equal(r.status, 400, JSON.stringify(b))
  }
  // badges from the first good upload is untouched; nothing from the bad ones stored
  const self = await call(a, u, 'GET', '/v1/me')
  assert.deepEqual(self.body.badges, ['first'])
  assert.equal('totals' in self.body, false)
  assert.equal('avatar' in self.body, false)
})

test('an old-shape upload (five keys, cards as strings) still works', async () => {
  const a = app()
  const u = await makeUser(a, 'U')
  await call(a, u, 'PATCH', '/v1/me', { visibility: { level: 'friends', badges: 'friends', cards: 'friends', goals: 'friends', wishlist: 'friends' } })
  const r = await call(a, u, 'PUT', '/v1/me/shared', { level: { level: 5, rank: 'saver' }, badges: ['first'], cards: ['steam', 'netflix'], goals: [{ brandKey: 'steam', pct: 30 }], wishlist: ['amazon'] })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.cards, [{ brandKey: 'steam' }, { brandKey: 'netflix' }]) // upgraded to objects
})

test('avatar rides on at most the first 50 friend rows', async () => {
  const store = createMemoryStore()
  const a = makeApp(store, {})
  const me = await makeUser(a, 'Me')
  const vis = { avatar: 'friends', level: 'off', badges: 'off', totals: 'off', goals: 'off', cards: 'off', wishlist: 'off' }
  for (let i = 0; i < 55; i++) {
    const fid = `friend${String(i).padStart(3, '0')}`
    await store.set(`fr:u:${fid}`, { id: fid, name: `F${i}`, visibility: vis, look: {} })
    await store.set(`fr:shared:${fid}`, { avatar: SVG })
    await store.sadd(`fr:friends:${me.id}`, fid)
    await store.set(`fr:since:${me.id}:${fid}`, new Date().toISOString())
  }
  const rows = (await call(a, me, 'GET', '/v1/friends')).body.friends
  assert.equal(rows.length, 55)
  assert.equal(rows.filter((r) => r.avatar).length, 50) // only the first 50 carry it
  assert.equal(rows.slice(0, 50).every((r) => r.avatar === SVG), true)
  assert.equal(rows.slice(50).every((r) => !('avatar' in r)), true)
})

test('the shared route accepts a body up to 32 KB', async () => {
  const a = app()
  const u = await makeUser(a, 'U')
  await call(a, u, 'PATCH', '/v1/me', { visibility: { avatar: 'friends' } })
  const avatar = 'data:image/png;base64,' + 'A'.repeat(12000) // ~12 KB avatar, valid base64, under the 12,288 cap
  const r = await call(a, u, 'PUT', '/v1/me/shared', { avatar })
  assert.equal(r.status, 200)
  assert.equal(r.body.avatar, avatar)
})

test('unknown route is 404 NOT_FOUND', async () => {
  const a = app()
  const u = await makeUser(a, 'Me')
  const res = await call(a, u, 'GET', '/v1/nope')
  assert.equal(res.status, 404)
  assert.equal(res.body.error, 'NOT_FOUND')
})

test('body over 16 KB is refused', async () => {
  const a = app()
  const u = await makeUser(a, 'Me')
  const big = { name: 'x'.repeat(17 * 1024) }
  const res = await call(a, u, 'PATCH', '/v1/me', big)
  assert.equal(res.status, 413)
})
