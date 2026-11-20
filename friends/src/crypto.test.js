import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { blake2b } from '@noble/hashes/blake2.js'
import { verifyWalletSignature, addressOf, walletKey, randomId, friendCode, CODE_RE } from './crypto.js'

const toHex = (u8) => Buffer.from(u8).toString('hex')
const fromHex = (h) => new Uint8Array(Buffer.from(h, 'hex'))
const utf8 = (s) => new Uint8Array(Buffer.from(String(s), 'utf8'))
const concat = (...ps) => { const n = ps.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of ps) { o.set(p, i); i += p.length } return o }

const newKey = () => { const sk = ed25519.utils.randomSecretKey(); return { sk, pub: toHex(ed25519.getPublicKey(sk)) } }

// The Nimiq signed-message hash, rebuilt here so the test does not lean on the module under test.
const nimiqHash = (message, lenOverride) => {
  const msg = utf8(message)
  return sha256(concat(Uint8Array.of(0x16), utf8('Nimiq Signed Message:\n'), utf8(String(lenOverride ?? msg.length)), msg))
}
const walletSign = (sk, message, lenOverride) => toHex(ed25519.sign(nimiqHash(message, lenOverride), sk))

// An independent address implementation: bit-string base32 and a BigInt IBAN check (not a copy of crypto.js).
function indieAddress(pubHex) {
  const h20 = blake2b(fromHex(pubHex), { dkLen: 32 }).subarray(0, 20)
  let bits = ''
  for (const b of h20) bits += b.toString(2).padStart(8, '0')
  const ALPH = '0123456789ABCDEFGHJKLMNPQRSTUVXY'
  let body = ''
  for (let i = 0; i < bits.length; i += 5) body += ALPH[parseInt(bits.slice(i, i + 5), 2)]
  let num = ''
  for (const ch of body + 'NQ00') { const code = ch.charCodeAt(0); num += code >= 48 && code <= 57 ? ch : String(code - 55) }
  const check = 98 - Number(BigInt(num) % 97n)
  return 'NQ' + String(check).padStart(2, '0') + body
}

test('verifyWalletSignature: a correct Nimiq signature verifies', () => {
  const { sk, pub } = newKey()
  const message = 'Dibs Friends: link this wallet\nDevice: ' + '11'.repeat(32) + '\nTime: 2026-11-21T00:00:00.000Z'
  assert.equal(verifyWalletSignature({ message, publicKey: pub, signature: walletSign(sk, message) }), true)
})

test('verifyWalletSignature: a changed message does not verify', () => {
  const { sk, pub } = newKey()
  const sig = walletSign(sk, 'original')
  assert.equal(verifyWalletSignature({ message: 'tampered', publicKey: pub, signature: sig }), false)
})

test('verifyWalletSignature: a changed length prefix does not verify', () => {
  const { sk, pub } = newKey()
  const message = 'hello world'
  const sig = walletSign(sk, message, message.length + 1) // signed with the wrong byte-length prefix
  assert.equal(verifyWalletSignature({ message, publicKey: pub, signature: sig }), false)
})

test('verifyWalletSignature: another key does not verify', () => {
  const a = newKey(); const b = newKey()
  const message = 'same text'
  assert.equal(verifyWalletSignature({ message, publicKey: b.pub, signature: walletSign(a.sk, message) }), false)
})

test('verifyWalletSignature: bad hex and wrong lengths give false', () => {
  const { sk, pub } = newKey()
  const message = 'x'
  const sig = walletSign(sk, message)
  assert.equal(verifyWalletSignature({ message, publicKey: 'zz'.repeat(32), signature: sig }), false)
  assert.equal(verifyWalletSignature({ message, publicKey: pub.slice(0, 62), signature: sig }), false)
  assert.equal(verifyWalletSignature({ message, publicKey: pub, signature: sig.slice(0, 126) }), false)
  assert.equal(verifyWalletSignature({ message, publicKey: pub, signature: 'gg'.repeat(64) }), false)
  assert.equal(verifyWalletSignature({ message: 123, publicKey: pub, signature: sig }), false)
})

test('addressOf: all-zero public key matches an independent implementation', () => {
  const zero = '0'.repeat(64)
  const a = addressOf(zero)
  assert.equal(a, indieAddress(zero))
  assert.match(a, /^NQ[0-9]{2}[0-9A-HJ-NP-VX-Y]{32}$/)
  assert.equal(a.length, 36)
})

test('addressOf: a generated key matches an independent implementation', () => {
  for (let i = 0; i < 5; i++) {
    const { pub } = newKey()
    assert.equal(addressOf(pub), indieAddress(pub))
  }
})

test('addressOf: bad input throws', () => {
  assert.throws(() => addressOf('nothex'))
  assert.throws(() => addressOf('00'.repeat(10)))
})

test('walletKey: stable, hex, and changes with the salt', () => {
  const addr = addressOf(newKey().pub)
  const before = process.env.FRIENDS_SALT
  process.env.FRIENDS_SALT = 'salt-one'
  const k1 = walletKey(addr)
  const k1b = walletKey(addr)
  process.env.FRIENDS_SALT = 'salt-two'
  const k2 = walletKey(addr)
  if (before === undefined) delete process.env.FRIENDS_SALT; else process.env.FRIENDS_SALT = before
  assert.match(k1, /^[0-9a-f]{64}$/)
  assert.equal(k1, k1b)
  assert.notEqual(k1, k2)
})

test('randomId: lowercase base32-ish, stable length, unique', () => {
  const ids = new Set()
  for (let i = 0; i < 200; i++) { const id = randomId(); assert.match(id, /^[a-z2-9]{26}$/); ids.add(id) }
  assert.equal(ids.size, 200)
})

test('friendCode: DIBS- prefix, safe alphabet, requested length', () => {
  assert.match(friendCode(4), CODE_RE)
  assert.match(friendCode(5), CODE_RE)
  for (let i = 0; i < 100; i++) assert.ok(!/[01OI]/.test(friendCode(4).slice(5)))
})
