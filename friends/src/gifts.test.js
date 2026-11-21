// Gifts: call dibs on a friend's wish. A claim = (owner, brand) -> { by, state, thanked }. The server learns three
// things only (who called dibs on which brand of whose wishlist, whether it was sent, whether thanks were said) and
// NEVER a value, an amount or a code. The owner must not learn about a claim in state 'claimed' from any route.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { createMemoryStore } from './store.js'
import { makeApp } from './index.js'

const toHex = (u8) => Buffer.from(u8).toString('hex')
const utf8 = (s) => new Uint8Array(Buffer.from(String(s), 'utf8'))
const concat = (...ps) => { const n = ps.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of ps) { o.set(p, i); i += p.length } return o }
const sha256hex = (s) => toHex(sha256(utf8(s)))
const newKey = () => { const sk = ed25519.utils.randomSecretKey(); return { sk, pub: toHex(ed25519.getPublicKey(sk)) } }
const nimiqHash = (message) => { const m = utf8(message); return sha256(concat(Uint8Array.of(0x16), utf8('Nimiq Signed Message:\n'), utf8(String(m.length)), m)) }
const walletSign = (sk, message) => toHex(ed25519.sign(nimiqHash(message), sk))

const app = () => makeApp(createMemoryStore(), {})
let ipN = 0
async function register(a, name) {
  const dev = newKey(); const wallet = newKey()
  const t = new Date().toISOString()
  const message = `Dibs Friends: link this wallet\nDevice: ${dev.pub}\nTime: ${t}`
  const body = { name, devicePub: dev.pub, wallet: { message, publicKey: wallet.pub, signature: walletSign(wallet.sk, message) } }
  const res = await a.request('/v1/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.${ipN++ >> 8}.${ipN & 255}` }, body: JSON.stringify(body) })
  const j = await res.json()
  return { id: j.body?.id ?? j.id, dev, code: j.code }
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
const makeUser = async (a, name) => { const r = await register(a, name); return { id: r.id, dev: r.dev, code: r.code } }
async function befriend(a, x, y) {
  await call(a, x, 'POST', '/v1/invites', { code: y.code })
  await call(a, y, 'POST', '/v1/invites', { code: x.code }) // mutual -> friends
}
async function shareWishlist(a, B, brands) {
  await call(a, B, 'PATCH', '/v1/me', { visibility: { wishlist: 'friends' } })
  await call(a, B, 'PUT', '/v1/me/shared', { wishlist: brands })
}
const wishUrl = (owner, brand, tail = '') => `/v1/users/${owner.id}/wishes/${brand}${tail}`

test('claim: happy path makes the giver see mine, the owner stays in the dark', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob')
  await befriend(a, A, B)
  await shareWishlist(a, B, ['steam', 'netflix'])

  const r = await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  assert.equal(r.status, 200)

  const aView = await call(a, A, 'GET', `/v1/users/${B.id}`)
  assert.deepEqual(aView.body.wishes.steam, { status: 'mine' })
  assert.ok(!('netflix' in aView.body.wishes), 'no claim on netflix: no entry')
})

test('claim: not friends, wishlist off, brand absent are all an indistinguishable 404', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob')
  // not friends yet, wishlist shared with a brand
  await shareWishlist(a, B, ['steam'])
  const notFriends = await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  assert.equal(notFriends.status, 404)
  assert.deepEqual(notFriends.body, { error: 'NOT_FOUND' })

  await befriend(a, A, B)
  // wishlist off
  await call(a, B, 'PATCH', '/v1/me', { visibility: { wishlist: 'off' } })
  const wlOff = await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  assert.equal(wlOff.status, 404)
  assert.deepEqual(wlOff.body, { error: 'NOT_FOUND' })

  // wishlist on but brand absent
  await shareWishlist(a, B, ['steam'])
  const absent = await call(a, A, 'POST', wishUrl(B, 'netflix', '/claim'))
  assert.equal(absent.status, 404)
  assert.deepEqual(absent.body, { error: 'NOT_FOUND' })
})

test('claim: TAKEN for another giver, 200 again for the same giver', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob'); const C = await makeUser(a, 'Cy')
  await befriend(a, A, B); await befriend(a, C, B)
  await shareWishlist(a, B, ['steam'])

  assert.equal((await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))).status, 200)
  const taken = await call(a, C, 'POST', wishUrl(B, 'steam', '/claim'))
  assert.equal(taken.status, 409)
  assert.deepEqual(taken.body, { error: 'TAKEN' })
  // same giver again: 200
  assert.equal((await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))).status, 200)
})

test('release: the giver frees a claimed wish; a sent gift cannot be released', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob'); const C = await makeUser(a, 'Cy')
  await befriend(a, A, B); await befriend(a, C, B)
  await shareWishlist(a, B, ['steam'])

  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  assert.equal((await call(a, A, 'DELETE', wishUrl(B, 'steam', '/claim'))).status, 200)
  // now C can claim it
  assert.equal((await call(a, C, 'POST', wishUrl(B, 'steam', '/claim'))).status, 200)
  // C marks it sent, then cannot release it
  await call(a, C, 'POST', wishUrl(B, 'steam', '/sent'))
  const refused = await call(a, C, 'DELETE', wishUrl(B, 'steam', '/claim'))
  assert.equal(refused.status, 409)
  assert.deepEqual(refused.body, { error: 'SENT' })
})

test('sent + thanks: the giver marks sent, the owner thanks; views update', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob'); const C = await makeUser(a, 'Cy')
  await befriend(a, A, B); await befriend(a, C, B)
  await shareWishlist(a, B, ['steam'])

  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  assert.equal((await call(a, A, 'POST', wishUrl(B, 'steam', '/sent'))).status, 200)

  // owner now sees the gift (from A), not thanked yet
  let me = await call(a, B, 'GET', '/v1/me')
  assert.deepEqual(me.body.gifts, [{ kind: 'wish', brandKey: 'steam', from: { id: A.id, name: 'Ann', seed: A.id }, thanked: false }])

  // A sees mine_sent; C sees gifted (never who the giver is)
  assert.deepEqual((await call(a, A, 'GET', `/v1/users/${B.id}`)).body.wishes.steam, { status: 'mine_sent' })
  assert.deepEqual((await call(a, C, 'GET', `/v1/users/${B.id}`)).body.wishes.steam, { status: 'gifted' })

  // owner says thanks (idempotent)
  assert.equal((await call(a, B, 'POST', '/v1/me/gifts/steam/thanks')).status, 200)
  assert.equal((await call(a, B, 'POST', '/v1/me/gifts/steam/thanks')).status, 200)
  me = await call(a, B, 'GET', '/v1/me')
  assert.equal(me.body.gifts[0].thanked, true)
  assert.deepEqual((await call(a, A, 'GET', `/v1/users/${B.id}`)).body.wishes.steam, { status: 'mine_sent', thanked: true })

  // thanks on a brand with no sent gift: 404
  assert.equal((await call(a, B, 'POST', '/v1/me/gifts/netflix/thanks')).status, 404)
})

test('the surprise: before sent, the owner sees byte-for-byte the same as with no claim', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob')
  await befriend(a, A, B)
  await shareWishlist(a, B, ['steam', 'netflix'])

  const before = {
    me: (await call(a, B, 'GET', '/v1/me')).body,
    asFriend: (await call(a, B, 'GET', '/v1/me/as-friend')).body,
    friends: (await call(a, B, 'GET', '/v1/friends')).body,
    self: (await call(a, B, 'GET', `/v1/users/${B.id}`)).body,
  }
  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  const after = {
    me: (await call(a, B, 'GET', '/v1/me')).body,
    asFriend: (await call(a, B, 'GET', '/v1/me/as-friend')).body,
    friends: (await call(a, B, 'GET', '/v1/friends')).body,
    self: (await call(a, B, 'GET', `/v1/users/${B.id}`)).body,
  }
  assert.deepEqual(after.me, before.me)
  assert.deepEqual(after.asFriend, before.asFriend)
  assert.deepEqual(after.self, before.self)
  // friends list ignores `since` timestamps that may equal anyway; compare directly
  assert.deepEqual(after.friends, before.friends)
  // and as-friend never carries a wishes object at all
  assert.ok(!('wishes' in after.asFriend))
})

test('a stranger sees nothing new', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob'); const S = await makeUser(a, 'Stran')
  await befriend(a, A, B)
  await shareWishlist(a, B, ['steam'])
  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  const asStranger = await call(a, S, 'GET', `/v1/users/${B.id}`)
  assert.deepEqual(asStranger.body, { id: B.id, name: 'Bob', seed: B.id })
})

test('cleanup: unfriend drops a claimed claim, keeps a sent gift', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob'); const C = await makeUser(a, 'Cy')
  await befriend(a, A, B); await befriend(a, C, B)
  await shareWishlist(a, B, ['steam', 'netflix'])

  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim')) // claimed, will be dropped
  await call(a, C, 'POST', wishUrl(B, 'netflix', '/claim'))
  await call(a, C, 'POST', wishUrl(B, 'netflix', '/sent')) // sent, stays

  await call(a, A, 'DELETE', `/v1/friends/${B.id}`) // A unfriends B
  // the steam claim is gone: C (still a friend) can now claim steam
  await call(a, C, 'POST', wishUrl(B, 'steam', '/claim'))
  assert.deepEqual((await call(a, C, 'GET', `/v1/users/${B.id}`)).body.wishes.steam, { status: 'mine' })
  // the sent netflix gift still shows for the owner
  const me = await call(a, B, 'GET', '/v1/me')
  assert.ok(me.body.gifts.some((g) => g.brandKey === 'netflix' && g.from.id === C.id))
})

test('cleanup: deleting an account drops its claims as giver and owner', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob'); const C = await makeUser(a, 'Cy')
  await befriend(a, A, B); await befriend(a, C, B); await befriend(a, A, C)
  await shareWishlist(a, B, ['steam'])
  await shareWishlist(a, C, ['netflix'])

  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim')) // A is giver on B
  await call(a, A, 'POST', wishUrl(C, 'netflix', '/claim')) // A is giver on C
  await call(a, A, 'DELETE', '/v1/me') // A deletes the account

  // B's steam wish is free again (B befriends a fresh user who can claim it)
  const D = await makeUser(a, 'Dee'); await befriend(a, D, B)
  assert.equal((await call(a, D, 'POST', wishUrl(B, 'steam', '/claim'))).status, 200)
})

test('limit: at most 10 open claims per giver', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann')
  const owners = []
  for (let i = 0; i < 11; i++) {
    const B = await makeUser(a, `B${i}`)
    await befriend(a, A, B)
    await shareWishlist(a, B, ['steam'])
    owners.push(B)
  }
  for (let i = 0; i < 10; i++) assert.equal((await call(a, A, 'POST', wishUrl(owners[i], 'steam', '/claim'))).status, 200)
  const over = await call(a, A, 'POST', wishUrl(owners[10], 'steam', '/claim'))
  assert.equal(over.status, 429)
  assert.deepEqual(over.body, { error: 'LIMIT' })
  // releasing one frees a slot
  await call(a, A, 'DELETE', wishUrl(owners[0], 'steam', '/claim'))
  assert.equal((await call(a, A, 'POST', wishUrl(owners[10], 'steam', '/claim'))).status, 200)
})

test('sent with no body (old phone) still works', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob')
  await befriend(a, A, B)
  await shareWishlist(a, B, ['steam'])
  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  const sent = await call(a, A, 'POST', wishUrl(B, 'steam', '/sent')) // no body
  assert.equal(sent.status, 200)
  const me = await call(a, B, 'GET', '/v1/me')
  assert.deepEqual(me.body.gifts, [{ kind: 'wish', brandKey: 'steam', from: { id: A.id, name: 'Ann', seed: A.id }, thanked: false }])
  assert.ok(!('message' in me.body.gifts[0]) && !('banner' in me.body.gifts[0]))
})

test('sent with a message and a banner: stored, shown only to the owner', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob'); const C = await makeUser(a, 'Cy')
  await befriend(a, A, B); await befriend(a, C, B)
  await shareWishlist(a, B, ['steam'])
  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  const sent = await call(a, A, 'POST', wishUrl(B, 'steam', '/sent'), { message: 'Happy birthday Bob', banner: 'birthday' })
  assert.equal(sent.status, 200)
  // The owner sees the message and banner on their own /v1/me only.
  const me = await call(a, B, 'GET', '/v1/me')
  assert.deepEqual(me.body.gifts, [{ kind: 'wish', brandKey: 'steam', from: { id: A.id, name: 'Ann', seed: A.id }, thanked: false, message: 'Happy birthday Bob', banner: 'birthday' }])
  // Not in the giver's view, not in the other friend's view, not in the owner's as-friend view.
  assert.deepEqual((await call(a, A, 'GET', `/v1/users/${B.id}`)).body.wishes.steam, { status: 'mine_sent' })
  assert.deepEqual((await call(a, C, 'GET', `/v1/users/${B.id}`)).body.wishes.steam, { status: 'gifted' })
  assert.ok(!('gifts' in (await call(a, B, 'GET', '/v1/me/as-friend')).body))
})

test('sent: a 141-char message, a link, and an unknown banner are each refused', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob')
  await befriend(a, A, B)
  await shareWishlist(a, B, ['steam'])
  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  const tooLong = await call(a, A, 'POST', wishUrl(B, 'steam', '/sent'), { message: 'x'.repeat(141) })
  assert.equal(tooLong.status, 400); assert.deepEqual(tooLong.body, { error: 'BAD_MESSAGE' })
  const link = await call(a, A, 'POST', wishUrl(B, 'steam', '/sent'), { message: 'go to shop.com/deal' })
  assert.equal(link.status, 400); assert.deepEqual(link.body, { error: 'BAD_MESSAGE' })
  const badBanner = await call(a, A, 'POST', wishUrl(B, 'steam', '/sent'), { message: 'hi', banner: 'party' })
  assert.equal(badBanner.status, 400); assert.deepEqual(badBanner.body, { error: 'BAD_BANNER' })
  // None of the refusals moved the claim to sent, nor stored anything.
  assert.deepEqual((await call(a, A, 'GET', `/v1/users/${B.id}`)).body.wishes.steam, { status: 'mine' })
})

test('the message and banner never appear in wishesFor, as-friend, a friend view or the leaderboard', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob'); const C = await makeUser(a, 'Cy')
  await befriend(a, A, B); await befriend(a, C, B)
  await shareWishlist(a, B, ['steam'])
  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  await call(a, A, 'POST', wishUrl(B, 'steam', '/sent'), { message: 'secret words only Bob sees', banner: 'thanks' })
  // Everyone on the global board; its rows must never carry the message or banner.
  for (const u of [A, B, C]) await call(a, u, 'PUT', '/v1/me/boards', { global: true })
  const blobs = [
    (await call(a, A, 'GET', `/v1/users/${B.id}`)).body, // giver's friend view (wishesFor)
    (await call(a, C, 'GET', `/v1/users/${B.id}`)).body, // another friend's view
    (await call(a, B, 'GET', '/v1/me/as-friend')).body,
    (await call(a, B, 'GET', '/v1/boards/global')).body,
    (await call(a, B, 'GET', '/v1/boards/friends')).body,
  ].map((b) => JSON.stringify(b)).join(' ')
  assert.ok(!/secret words/.test(blobs), 'the message text leaked')
  for (const bad of ['message', 'banner']) assert.ok(!new RegExp(`"${bad}"\\s*:`).test(blobs), `a "${bad}" field leaked`)
})

test('removing a wish strips the message and banner but keeps the sent gift', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob')
  await befriend(a, A, B)
  await shareWishlist(a, B, ['steam', 'netflix'])
  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  await call(a, A, 'POST', wishUrl(B, 'steam', '/sent'), { message: 'enjoy it', banner: 'congrats' })
  // B removes steam from the shared wishlist (keeps netflix).
  await call(a, B, 'PUT', '/v1/me/shared', { wishlist: ['netflix'] })
  const me = await call(a, B, 'GET', '/v1/me')
  const gift = me.body.gifts.find((g) => g.brandKey === 'steam')
  assert.ok(gift, 'the sent gift still shows')
  assert.ok(!('message' in gift) && !('banner' in gift), 'the message and banner were stripped')
})

test('deleting the account removes the gift, message and banner with it', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob')
  await befriend(a, A, B)
  await shareWishlist(a, B, ['steam'])
  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  await call(a, A, 'POST', wishUrl(B, 'steam', '/sent'), { message: 'bye', banner: 'because' })
  await call(a, A, 'DELETE', '/v1/me')
  const me = await call(a, B, 'GET', '/v1/me')
  assert.deepEqual(me.body.gifts, [])
})

test('no gift response ever carries a value, an amount or a code field', async () => {
  const a = app()
  const A = await makeUser(a, 'Ann'); const B = await makeUser(a, 'Bob')
  await befriend(a, A, B)
  await shareWishlist(a, B, ['steam'])
  await call(a, A, 'POST', wishUrl(B, 'steam', '/claim'))
  await call(a, A, 'POST', wishUrl(B, 'steam', '/sent'))
  // Only the gift-specific structures: the wishes map a giver sees, and the owner's gifts array. (The owner's own
  // friend code lives elsewhere on /v1/me and is not a gift card code.)
  const wishes = (await call(a, A, 'GET', `/v1/users/${B.id}`)).body.wishes
  const gifts = (await call(a, B, 'GET', '/v1/me')).body.gifts
  const blobs = `${JSON.stringify(wishes)} ${JSON.stringify(gifts)}`
  for (const bad of ['value', 'amount', 'code', 'pin', 'nim', 'usd', 'eur']) {
    assert.ok(!new RegExp(`"[^"]*${bad}[^"]*"\\s*:`, 'i').test(blobs), `no "${bad}" field in gift responses`)
  }
})
