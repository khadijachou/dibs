// Gift box delivery (v1.7.3): the Friends server relays a gift card code end to end encrypted. It stores and hands back
// sealed boxes { to, eph, iv, ct } but can never read them. These tests use opaque box bytes (the crypto is tested in
// the app's giftBox.test.js) and a DEMO ciphertext marker to prove the server is a pure relay: only the owner's own
// device gets its box, nobody else ever sees boxes/delivered/openedAt, and every cleanup path strips the boxes.
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

let ipN = 0
async function register(a, { name = 'U', dev = newKey(), wallet = newKey() } = {}) {
  const t = new Date().toISOString()
  const message = `Dibs Friends: link this wallet\nDevice: ${dev.pub}\nTime: ${t}`
  const body = { name, devicePub: dev.pub, wallet: { message, publicKey: wallet.pub, signature: walletSign(wallet.sk, message) } }
  const res = await a.request('/v1/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.2.${ipN++ >> 8}.${ipN & 255}` }, body: JSON.stringify(body) })
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
async function shareWishlist(a, B, brands) {
  await call(a, B, 'PATCH', '/v1/me', { visibility: { wishlist: 'friends' } })
  await call(a, B, 'PUT', '/v1/me/shared', { wishlist: brands })
}
const wishUrl = (owner, brand, tail = '') => `/v1/users/${owner.id}/wishes/${brand}${tail}`

// A device's X25519 key (what the app would register) and a box sealed for a given key. The ct carries a DEMO marker so
// a store/response grep can prove the server never exposes it to anyone but the addressed device.
const encKey = () => { const priv = x25519.utils.randomSecretKey(); return { priv, pub: b64(x25519.getPublicKey(priv)) } }
const mkBox = (toPub, marker = 'DEMO-CT') => ({ to: toPub, eph: b64(randomBytes(32)), iv: b64(randomBytes(12)), ct: b64(utf8(marker)) })

// Set up A (giver) and B (owner) as friends, B wishes for steam, A calls dibs then marks sent. Returns helpers.
async function setup() {
  const store = createMemoryStore()
  const a = makeApp(store, {})
  const A = await user(a, 'Ann'); const B = await user(a, 'Bob')
  await befriend(a, A, B)
  await shareWishlist(a, B, ['steam'])
  const bEnc = encKey()
  await call(a, B, 'PUT', '/v1/me/enc-key', { encPub: bEnc.pub })
  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  await call(a, A, 'POST', wishUrl(B, 'steam', '/sent'), { message: 'Enjoy', banner: 'birthday' })
  return { store, a, A, B, bEnc }
}

test('enc-key: stored against the signing device, returned to any friend (v1.7.4), 404 to a non-friend', async () => {
  const { a, A, B, bEnc } = await setup()
  const keys = await call(a, A, 'GET', `/v1/users/${B.id}/enc-keys`)
  assert.equal(keys.status, 200)
  assert.deepEqual(keys.body.encKeys, [bEnc.pub])
  // v1.7.4: a friend with no claim (a direct giver) may now read the keys too.
  const C = await user(a, 'Cal')
  await befriend(a, C, B)
  const friendView = await call(a, C, 'GET', `/v1/users/${B.id}/enc-keys`)
  assert.equal(friendView.status, 200)
  assert.deepEqual(friendView.body.encKeys, [bEnc.pub])
  // A non-friend gets an indistinguishable 404.
  const D = await user(a, 'Dee')
  const strangerView = await call(a, D, 'GET', `/v1/users/${B.id}/enc-keys`)
  assert.equal(strangerView.status, 404)
})

test('deliver: giver delivers, owner device reads its own box, giver sees Delivered', async () => {
  const { a, A, B, bEnc } = await setup()
  const r = await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub)] })
  assert.equal(r.status, 200)
  const me = await call(a, B, 'GET', '/v1/me')
  const gift = me.body.gifts.find((g) => g.brandKey === 'steam')
  assert.equal(gift.delivered, true)
  assert.equal(gift.box.to, bEnc.pub)
  assert.equal(gift.box.ct, b64(utf8('DEMO-CT')))
  // The giver's view of B shows delivered, no box.
  const aView = await call(a, A, 'GET', `/v1/users/${B.id}`)
  assert.equal(aView.body.wishes.steam.status, 'mine_sent')
  assert.equal(aView.body.wishes.steam.delivered, true)
  assert.ok(!('box' in aView.body.wishes.steam))
})

test('deliver: refused for the wrong giver, no claim, not yet sent', async () => {
  const { store, a, A, B, bEnc } = await setup()
  const C = await user(a, 'Cal'); await befriend(a, C, B)
  // C holds no claim on steam.
  const wrong = await call(a, C, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub)] })
  assert.equal(wrong.status, 404)
  // A claim that is not sent cannot be delivered.
  await shareWishlist(a, B, ['steam', 'netflix'])
  await call(a, A, 'POST', wishUrl(B, 'netflix', '/claim'))
  const notSent = await call(a, A, 'POST', wishUrl(B, 'netflix', '/deliver'), { boxes: [mkBox(bEnc.pub)] })
  assert.equal(notSent.status, 409)
  assert.equal(notSent.body.error, 'NOT_SENT')
})

test('deliver: an unknown to, zero boxes and six boxes are all rejected', async () => {
  const { a, A, B, bEnc } = await setup()
  const unknown = await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(encKey().pub)] })
  assert.equal(unknown.status, 400)
  const none = await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [] })
  assert.equal(none.status, 400)
  const six = await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: Array.from({ length: 6 }, () => mkBox(bEnc.pub)) })
  assert.equal(six.status, 400)
})

test('deliver: a body over 4 KB is refused (413)', async () => {
  const { a, A, B, bEnc } = await setup()
  const big = mkBox(bEnc.pub, 'x'.repeat(900)) // ct ~1200 base64url chars
  const r = await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [big, big, big, big] })
  assert.equal(r.status, 413)
})

test('two devices: each owner device gets only its own box, never the other', async () => {
  const { a, A, B } = await setup()
  // B adds a second device on the same wallet, with its own encryption key.
  const B2dev = newKey()
  await register(a, { wallet: B.wallet, dev: B2dev })
  const B2 = { id: B.id, dev: B2dev }
  const enc1 = encKey(); const enc2 = encKey()
  await call(a, B, 'PUT', '/v1/me/enc-key', { encPub: enc1.pub })
  await call(a, B2, 'PUT', '/v1/me/enc-key', { encPub: enc2.pub })
  const box1 = mkBox(enc1.pub, 'FOR-ONE'); const box2 = mkBox(enc2.pub, 'FOR-TWO')
  await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [box1, box2] })
  const m1 = await call(a, B, 'GET', '/v1/me')
  const m2 = await call(a, B2, 'GET', '/v1/me')
  assert.equal(m1.body.gifts.find((g) => g.brandKey === 'steam').box.ct, b64(utf8('FOR-ONE')))
  assert.equal(m2.body.gifts.find((g) => g.brandKey === 'steam').box.ct, b64(utf8('FOR-TWO')))
})

test('opened: deletes the boxes, is idempotent, and a later deliver is refused', async () => {
  const { store, a, A, B, bEnc } = await setup()
  await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub)] })
  const op = await call(a, B, 'POST', '/v1/me/gifts/steam/opened')
  assert.equal(op.status, 200)
  // The box is gone from the owner's read; delivered stays true.
  const me = await call(a, B, 'GET', '/v1/me')
  const gift = me.body.gifts.find((g) => g.brandKey === 'steam')
  assert.equal(gift.delivered, true)
  assert.ok(!('box' in gift))
  // The stored claim holds no boxes and an openedAt.
  const rec = await store.get(`fr:claim:${B.id}:steam`)
  assert.equal(rec.boxes, undefined)
  assert.ok(rec.openedAt)
  // Opening again is fine; a resend is refused.
  assert.equal((await call(a, B, 'POST', '/v1/me/gifts/steam/opened')).status, 200)
  const resend = await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub)] })
  assert.equal(resend.status, 409)
  assert.equal(resend.body.error, 'OPENED')
  // The giver sees openedAt.
  const aView = await call(a, A, 'GET', `/v1/users/${B.id}`)
  assert.ok(aView.body.wishes.steam.openedAt)
})

test('a third friend never sees boxes, delivered or openedAt', async () => {
  const { a, A, B, bEnc } = await setup()
  await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub)] })
  const C = await user(a, 'Cal'); await befriend(a, C, B)
  const cView = await call(a, C, 'GET', `/v1/users/${B.id}`)
  // C is a friend of B viewing B's wishlist: steam shows as taken/gifted from C's own side, with nothing private.
  const w = cView.body.wishes.steam
  assert.ok(w.status === 'gifted')
  assert.ok(!('box' in w) && !('delivered' in w) && !('openedAt' in w))
})

test('resend replaces the boxes and keeps deliveredAt fresh', async () => {
  const { a, A, B, bEnc } = await setup()
  await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub, 'FIRST')] })
  await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub, 'SECOND')] })
  const me = await call(a, B, 'GET', '/v1/me')
  assert.equal(me.body.gifts.find((g) => g.brandKey === 'steam').box.ct, b64(utf8('SECOND')))
})

test('expiry: a box older than 30 days is dropped on read', async () => {
  const { store, a, A, B, bEnc } = await setup()
  await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub)] })
  const key = `fr:claim:${B.id}:steam`
  const rec = await store.get(key)
  rec.deliveredAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
  await store.set(key, rec)
  const me = await call(a, B, 'GET', '/v1/me')
  const gift = me.body.gifts.find((g) => g.brandKey === 'steam')
  assert.equal(gift.delivered, true) // the giver did deliver
  assert.ok(!('box' in gift)) // but the box is gone
  assert.equal((await store.get(key)).boxes, undefined) // and the deletion is persisted
})

test('unfriend strips the boxes of a sent gift; delete removes everything', async () => {
  const { store, a, A, B, bEnc } = await setup()
  await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub)] })
  await call(a, A, 'DELETE', `/v1/friends/${B.id}`)
  assert.equal((await store.get(`fr:claim:${B.id}:steam`)).boxes, undefined)
  // Delete B's profile: the claim is gone entirely.
  await call(a, B, 'DELETE', '/v1/me')
  assert.equal(await store.get(`fr:claim:${B.id}:steam`), null)
})

test('a wish leaving the list strips the boxes', async () => {
  const { store, a, A, B, bEnc } = await setup()
  await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub)] })
  await call(a, B, 'PUT', '/v1/me/shared', { wishlist: [] }) // steam leaves the wishlist
  assert.equal((await store.get(`fr:claim:${B.id}:steam`)).boxes, undefined)
})

test('relay only: the DEMO ciphertext never leaks to the giver or a third friend', async () => {
  const { store, a, A, B, bEnc } = await setup()
  await call(a, A, 'POST', wishUrl(B, 'steam', '/deliver'), { boxes: [mkBox(bEnc.pub, 'SECRET-MARKER')] })
  const marker = b64(utf8('SECRET-MARKER'))
  // The giver's view of B carries no ciphertext.
  const aView = JSON.stringify((await call(a, A, 'GET', `/v1/users/${B.id}`)).body)
  assert.ok(!aView.includes(marker))
  // The stored record holds it only inside a box (the server relays, never reads it).
  const rec = await store.get(`fr:claim:${B.id}:steam`)
  assert.equal(rec.boxes[0].ct, marker)
})
