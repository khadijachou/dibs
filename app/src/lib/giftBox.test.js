import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { encKeys, encPub, seal, open } from './giftBox.js'

// A tiny localStorage shim, swappable per "phone" so a seal for phone A cannot be opened on phone B.
function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }
}
const ENC = 'dibs.friends.enc'
beforeEach(() => { globalThis.localStorage = fakeStorage() })

const RED = { code: 'DEMO-CODE-1234', pin: '4321', link: 'https://shop.example/redeem' }
const AAD = 'OWNERID:steam:GIVERID'

test('round trip: a sealed redemption opens back to the same fields', async () => {
  const them = await encKeys() // the receiver on this phone
  const box = await seal(RED, them.pubB64, AAD)
  assert.equal(box.to, them.pubB64)
  assert.ok(box.eph && box.iv && box.ct)
  const out = await open(box, AAD)
  assert.deepEqual(out, RED)
})

test('round trip: only the fields that exist are carried', async () => {
  const them = await encKeys()
  const box = await seal({ code: 'DEMO-CODE-9999' }, them.pubB64, AAD)
  assert.deepEqual(await open(box, AAD), { code: 'DEMO-CODE-9999' })
})

test('wrong key: a box sealed for one phone cannot be opened on another', async () => {
  const store = globalThis.localStorage
  const theirPub = await encPub() // receiver's key, stored on this phone
  const box = await seal(RED, theirPub, AAD)
  globalThis.localStorage = fakeStorage() // a different phone, a different private key
  await assert.rejects(() => open(box, AAD))
  globalThis.localStorage = store // the real receiver can still open it
  assert.deepEqual(await open(box, AAD), RED)
})

test('changed aad: an aad mismatch fails to open', async () => {
  const them = await encKeys()
  const box = await seal(RED, them.pubB64, AAD)
  await assert.rejects(() => open(box, 'OWNERID:steam:SOMEONE_ELSE'))
})

test('changed ciphertext: a tampered box fails to open', async () => {
  const them = await encKeys()
  const box = await seal(RED, them.pubB64, AAD)
  const bad = { ...box, ct: box.ct.slice(0, -2) + (box.ct.endsWith('A') ? 'B' : 'A') + box.ct.slice(-1) }
  await assert.rejects(() => open(bad, AAD))
})

test('two seals of the same code differ (fresh ephemeral key and IV)', async () => {
  const them = await encKeys()
  const b1 = await seal(RED, them.pubB64, AAD)
  const b2 = await seal(RED, them.pubB64, AAD)
  assert.notEqual(b1.ct, b2.ct)
  assert.notEqual(b1.eph, b2.eph)
  assert.notEqual(b1.iv, b2.iv)
  assert.deepEqual(await open(b1, AAD), await open(b2, AAD)) // both still open to the same thing
})
