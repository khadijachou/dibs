// Direct gifts (v1.7.4): a gift a user sends from their OWN goal to a friend, not tied to any wish. The server records
// who sent which brand to whom, the optional message and banner, and relays the sealed code boxes (v1.7.3) it can never
// read. These tests prove the friend rule, the validation, the idempotent giftId, the daily and per-receiver caps, that
// only the addressed device gets its box, and every cleanup path. The DEMO ciphertext proves the server is a pure relay.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { createMemoryStore } from './store.js'
import { makeApp } from './index.js'

const toHex = (u8) => Buffer.from(u8).toString('hex')
const b64 = (u8) => Buffer.from(u8).toString('base64url')
const utf8 = (s) => new Uint8Array(Buffer.from(String(s), 'utf8'))
const concat = (...ps) => { const n = ps.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of ps) { o.set(p, i); i += p.length } return o }
const sha256hex = (s) => toHex(sha256(utf8(s)))
const newKey = () => { const sk = ed25519.utils.randomSecretKey(); return { sk, pub: toHex(ed25519.getPublicKey(sk)) } }
const nimiqHash = (message) => { const m = utf8(message); return sha256(concat(Uint8Array.of(0x16), utf8('Nimiq Signed Message:\n'), utf8(String(m.length)), m)) }
const walletSign = (sk, message) => toHex(ed25519.sign(nimiqHash(message), sk))
const giftId = () => toHex(randomBytes(16)) // 32 hex, as the phone would generate

let ipN = 0
async function register(a, { name = 'U', dev = newKey(), wallet = newKey() } = {}) {
  const t = new Date().toISOString()
  const message = `Dibs Friends: link this wallet\nDevice: ${dev.pub}\nTime: ${t}`
  const body = { name, devicePub: dev.pub, wallet: { message, publicKey: wallet.pub, signature: walletSign(wallet.sk, message) } }
  const res = await a.request('/v1/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.3.${ipN++ >> 8}.${ipN & 255}` }, body: JSON.stringify(body) })
  const j = await res.json()
  return { id: j.id, dev, wallet, code: j.code }
}
function signedHeaders(dev, id, method, path, bodyText) {
  const ts = Date.now(); const nonce = toHex(randomBytes(16))
  const canonical = `${method}\n${path}\n${ts}\n${nonce}\n${sha256hex(bodyText || '')}`
  return { 'X-Dibs-Id': id, 'X-Dibs-Ts': String(ts), 'X-Dibs-Nonce': nonce, 'X-Dibs-Sig': toHex(ed25519.sign(utf8(canonical), dev.sk)) }
}
async function call(a, who, method, path, bodyObj) {
  const bodyText = bodyObj === undefined ? '' : JSON.stringify(bodyObj)
  const headers = signedHeaders(who.dev, who.id, method, path, bodyText)
  const init = { method, headers }
  if (method !== 'GET') { headers['content-type'] = 'application/json'; init.body = bodyText }
  const res = await a.request(path, init)
  return { status: res.status, body: await res.json().catch(() => null) }
}
const user = async (a, name) => { const r = await register(a, { name }); return { id: r.id, dev: r.dev, wallet: r.wallet, code: r.code } }
async function befriend(a, x, y) {
  await call(a, x, 'POST', '/v1/invites', { code: y.code })
  await call(a, y, 'POST', '/v1/invites', { code: x.code })
}
const encKey = () => { const priv = x25519.utils.randomSecretKey(); return { priv, pub: b64(x25519.getPublicKey(priv)) } }
const mkBox = (toPub, marker = 'DEMO-CT') => ({ to: toPub, eph: b64(randomBytes(32)), iv: b64(randomBytes(12)), ct: b64(utf8(marker)) })
const giftsUrl = (receiver, tail = '') => `/v1/users/${receiver.id}/gifts${tail}`

test('create: a friend gifts, the receiver sees it with kind direct; a non-friend is refused', async () => {
  const store = createMemoryStore()
  const a = makeApp(store, {})
  const A = await user(a, 'Ann'); const B = await user(a, 'Bob')
  // Not friends yet: refused.
  const notFriends = await call(a, A, 'POST', giftsUrl(B), { giftId: giftId(), brandKey: 'steam' })
  assert.equal(notFriends.status, 404)

  await befriend(a, A, B)
  const gid = giftId()
  const made = await call(a, A, 'POST', giftsUrl(B), { giftId: gid, brandKey: 'steam', message: 'Enjoy Bob', banner: 'birthday' })
  assert.equal(made.status, 200)
  const me = await call(a, B, 'GET', '/v1/me')
  assert.deepEqual(me.body.gifts, [{ kind: 'direct', giftId: gid, brandKey: 'steam', from: { id: A.id, name: 'Ann', seed: A.id }, thanked: false, message: 'Enjoy Bob', banner: 'birthday' }])
})

test('create: a bad message, a link, and an unknown banner are each refused and store nothing', async () => {
  const store = createMemoryStore()
  const a = makeApp(store, {})
  const A = await user(a, 'Ann'); const B = await user(a, 'Bob')
  await befriend(a, A, B)
  const tooLong = await call(a, A, 'POST', giftsUrl(B), { giftId: giftId(), brandKey: 'steam', message: 'x'.repeat(141) })
  assert.equal(tooLong.status, 400); assert.equal(tooLong.body.error, 'BAD_MESSAGE')
  const link = await call(a, A, 'POST', giftsUrl(B), { giftId: giftId(), brandKey: 'steam', message: 'go to shop.com/deal' })
  assert.equal(link.status, 400); assert.equal(link.body.error, 'BAD_MESSAGE')
  const badBanner = await call(a, A, 'POST', giftsUrl(B), { giftId: giftId(), brandKey: 'steam', banner: 'party' })
  assert.equal(badBanner.status, 400); assert.equal(badBanner.body.error, 'BAD_BANNER')
  const badId = await call(a, A, 'POST', giftsUrl(B), { giftId: 'nothex', brandKey: 'steam' })
  assert.equal(badId.status, 400)
  const badBrand = await call(a, A, 'POST', giftsUrl(B), { giftId: giftId(), brandKey: 'Not A Brand' })
  assert.equal(badBrand.status, 400)
  assert.deepEqual((await call(a, B, 'GET', '/v1/me')).body.gifts, [])
})

test('idempotent: the same giftId by the same giver is ok; a different giver/receiver is a 409', async () => {
  const store = createMemoryStore()
  const a = makeApp(store, {})
  const A = await user(a, 'Ann'); const B = await user(a, 'Bob'); const C = await user(a, 'Cy')
  await befriend(a, A, B); await befriend(a, C, B); await befriend(a, A, C)
  const gid = giftId()
  assert.equal((await call(a, A, 'POST', giftsUrl(B), { giftId: gid, brandKey: 'steam' })).status, 200)
  assert.equal((await call(a, A, 'POST', giftsUrl(B), { giftId: gid, brandKey: 'steam' })).status, 200) // same again: ok
  // A different giver reusing the id: conflict.
  const clash = await call(a, C, 'POST', giftsUrl(B), { giftId: gid, brandKey: 'steam' })
  assert.equal(clash.status, 409)
  // The same giver but a different receiver reusing the id: conflict.
  const clash2 = await call(a, A, 'POST', giftsUrl(C), { giftId: gid, brandKey: 'steam' })
  assert.equal(clash2.status, 409)
  // Still exactly one gift for B.
  assert.equal((await call(a, B, 'GET', '/v1/me')).body.gifts.length, 1)
})

test('limit: at most 20 direct gifts per giver per day', async () => {
  const store = createMemoryStore()
  const a = makeApp(store, {})
  const A = await user(a, 'Ann'); const B = await user(a, 'Bob')
  await befriend(a, A, B)
  for (let i = 0; i < 20; i++) assert.equal((await call(a, A, 'POST', giftsUrl(B), { giftId: giftId(), brandKey: 'steam' })).status, 200)
  const over = await call(a, A, 'POST', giftsUrl(B), { giftId: giftId(), brandKey: 'steam' })
  assert.equal(over.status, 429); assert.equal(over.body.error, 'LIMIT')
})

test('per-receiver cap: the 101st record drops the oldest', async () => {
  const store = createMemoryStore()
  const a = makeApp(store, {})
  const A = await user(a, 'Ann'); const B = await user(a, 'Bob')
  await befriend(a, A, B)
  // Seed 100 records straight into the store (bypassing the 20/day route cap), oldest first by sentAt.
  const ids = []
  for (let i = 0; i < 100; i++) {
    const gid = giftId(); ids.push(gid)
    const sentAt = new Date(Date.UTC(2020, 0, 1, 0, 0, i)).toISOString()
    await store.set(`fr:dgift:${gid}`, { giver: A.id, receiver: B.id, brandKey: 'steam', sentAt, thanked: false })
    await store.sadd(`fr:dgifts:to:${B.id}`, gid)
    await store.sadd(`fr:dgifts:by:${A.id}`, gid)
  }
  // One more via the route tips it over 100: the oldest seeded record is dropped.
  const fresh = giftId()
  assert.equal((await call(a, A, 'POST', giftsUrl(B), { giftId: fresh, brandKey: 'steam' })).status, 200)
  assert.equal(await store.get(`fr:dgift:${ids[0]}`), null) // oldest gone
  assert.ok(await store.get(`fr:dgift:${ids[99]}`)) // newest seeded kept
  assert.ok(await store.get(`fr:dgift:${fresh}`)) // the new one kept
  // The dropped record left no dangling index members.
  assert.ok(!(await store.smembers(`fr:dgifts:to:${B.id}`)).includes(ids[0]))
  assert.ok(!(await store.smembers(`fr:dgifts:by:${A.id}`)).includes(ids[0]))
})

// Set up A (giver) and B (owner) as friends with B's encryption key, and a sent direct gift. Returns helpers + giftId.
async function setupDelivery() {
  const store = createMemoryStore()
  const a = makeApp(store, {})
  const A = await user(a, 'Ann'); const B = await user(a, 'Bob')
  await befriend(a, A, B)
  const bEnc = encKey()
  await call(a, B, 'PUT', '/v1/me/enc-key', { encPub: bEnc.pub })
  const gid = giftId()
  await call(a, A, 'POST', giftsUrl(B), { giftId: gid, brandKey: 'steam', message: 'Enjoy', banner: 'birthday' })
  return { store, a, A, B, bEnc, gid }
}

test('deliver: receiver reads its own box; the giver sees Delivered then Opened, never the box', async () => {
  const { a, A, B, bEnc, gid } = await setupDelivery()
  const r = await call(a, A, 'POST', giftsUrl(B, `/${gid}/deliver`), { boxes: [mkBox(bEnc.pub, 'SECRET')] })
  assert.equal(r.status, 200)
  const me = await call(a, B, 'GET', '/v1/me')
  const gift = me.body.gifts.find((g) => g.giftId === gid)
  assert.equal(gift.delivered, true)
  assert.equal(gift.box.ct, b64(utf8('SECRET')))
  // The giver sees directSent with delivered, no box.
  const aView = await call(a, A, 'GET', `/v1/users/${B.id}`)
  const sent = aView.body.directSent.find((g) => g.giftId === gid)
  assert.equal(sent.delivered, true)
  assert.ok(!('box' in sent) && !('openedAt' in sent))
  assert.ok(!JSON.stringify(aView.body).includes(b64(utf8('SECRET')))) // the ciphertext never reaches the giver
  // Receiver opens: box gone, giver sees openedAt.
  assert.equal((await call(a, B, 'POST', `/v1/me/gifts/direct/${gid}/opened`)).status, 200)
  const me2 = await call(a, B, 'GET', '/v1/me')
  assert.ok(!('box' in me2.body.gifts.find((g) => g.giftId === gid)))
  const aView2 = await call(a, A, 'GET', `/v1/users/${B.id}`)
  assert.ok(aView2.body.directSent.find((g) => g.giftId === gid).openedAt)
  // A resend after opening is refused.
  assert.equal((await call(a, A, 'POST', giftsUrl(B, `/${gid}/deliver`), { boxes: [mkBox(bEnc.pub)] })).status, 409)
})

test('two devices: each receiver device gets only its own box', async () => {
  const { a, A, B, gid } = await setupDelivery()
  const B2dev = newKey()
  await register(a, { wallet: B.wallet, dev: B2dev })
  const B2 = { id: B.id, dev: B2dev }
  const enc1 = encKey(); const enc2 = encKey()
  await call(a, B, 'PUT', '/v1/me/enc-key', { encPub: enc1.pub })
  await call(a, B2, 'PUT', '/v1/me/enc-key', { encPub: enc2.pub })
  await call(a, A, 'POST', giftsUrl(B, `/${gid}/deliver`), { boxes: [mkBox(enc1.pub, 'FOR-ONE'), mkBox(enc2.pub, 'FOR-TWO')] })
  const m1 = await call(a, B, 'GET', '/v1/me')
  const m2 = await call(a, B2, 'GET', '/v1/me')
  assert.equal(m1.body.gifts.find((g) => g.giftId === gid).box.ct, b64(utf8('FOR-ONE')))
  assert.equal(m2.body.gifts.find((g) => g.giftId === gid).box.ct, b64(utf8('FOR-TWO')))
})

test('a third friend and the giver never get the box, delivered or openedAt in their friend view', async () => {
  const { a, A, B, bEnc, gid } = await setupDelivery()
  await call(a, A, 'POST', giftsUrl(B, `/${gid}/deliver`), { boxes: [mkBox(bEnc.pub, 'SECRET')] })
  const C = await user(a, 'Cal'); await befriend(a, C, B)
  const cView = await call(a, C, 'GET', `/v1/users/${B.id}`)
  // C sees nothing about the direct gift at all (direct gifts are never shown to a third party).
  assert.ok(!('directSent' in cView.body)) // C sent nothing
  assert.ok(!JSON.stringify(cView.body).includes(b64(utf8('SECRET'))))
  // The giver's gifts list (as a receiver) is empty: A received nothing.
  assert.deepEqual((await call(a, A, 'GET', '/v1/me')).body.gifts, [])
})

test('thanks: the receiver thanks, the giver sees it; a wrong receiver is a 404', async () => {
  const { a, A, B, gid } = await setupDelivery()
  const C = await user(a, 'Cal')
  assert.equal((await call(a, C, 'POST', `/v1/me/gifts/direct/${gid}/thanks`)).status, 404) // not the receiver
  assert.equal((await call(a, B, 'POST', `/v1/me/gifts/direct/${gid}/thanks`)).status, 200)
  assert.equal((await call(a, B, 'POST', `/v1/me/gifts/direct/${gid}/thanks`)).status, 200) // idempotent
  assert.equal((await call(a, B, 'GET', '/v1/me')).body.gifts.find((g) => g.giftId === gid).thanked, true)
  assert.equal((await call(a, A, 'GET', `/v1/users/${B.id}`)).body.directSent.find((g) => g.giftId === gid).thanked, true)
})

test('directSent: a giver sees only its own gifts to that friend, nobody else does', async () => {
  const store = createMemoryStore()
  const a = makeApp(store, {})
  const A = await user(a, 'Ann'); const B = await user(a, 'Bob'); const C = await user(a, 'Cy')
  await befriend(a, A, B); await befriend(a, C, B)
  const gA = giftId(); const gC = giftId()
  await call(a, A, 'POST', giftsUrl(B), { giftId: gA, brandKey: 'steam' })
  await call(a, C, 'POST', giftsUrl(B), { giftId: gC, brandKey: 'netflix' })
  const aView = await call(a, A, 'GET', `/v1/users/${B.id}`)
  assert.deepEqual(aView.body.directSent.map((g) => g.giftId), [gA])
  const cView = await call(a, C, 'GET', `/v1/users/${B.id}`)
  assert.deepEqual(cView.body.directSent.map((g) => g.giftId), [gC])
  // B viewing A is a stranger-to-direct: no directSent (B sent A nothing).
  assert.ok(!('directSent' in (await call(a, B, 'GET', `/v1/users/${A.id}`)).body))
})

test('cleanup: unfriend strips the boxes but keeps the record; delete removes it entirely', async () => {
  const { store, a, A, B, bEnc, gid } = await setupDelivery()
  await call(a, A, 'POST', giftsUrl(B, `/${gid}/deliver`), { boxes: [mkBox(bEnc.pub)] })
  await call(a, A, 'DELETE', `/v1/friends/${B.id}`)
  const rec = await store.get(`fr:dgift:${gid}`)
  assert.ok(rec && rec.boxes === undefined) // record stays, boxes stripped
  await call(a, B, 'DELETE', '/v1/me')
  assert.equal(await store.get(`fr:dgift:${gid}`), null) // gone with the receiver's account
  assert.deepEqual(await store.smembers(`fr:dgifts:by:${A.id}`), []) // and no dangling index member for the giver
})

test('expiry: a box older than 30 days is dropped on the receiver read', async () => {
  const { store, a, A, B, bEnc, gid } = await setupDelivery()
  await call(a, A, 'POST', giftsUrl(B, `/${gid}/deliver`), { boxes: [mkBox(bEnc.pub)] })
  const rec = await store.get(`fr:dgift:${gid}`)
  rec.deliveredAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
  await store.set(`fr:dgift:${gid}`, rec)
  const gift = (await call(a, B, 'GET', '/v1/me')).body.gifts.find((g) => g.giftId === gid)
  assert.equal(gift.delivered, true)
  assert.ok(!('box' in gift))
  assert.equal((await store.get(`fr:dgift:${gid}`)).boxes, undefined)
})
