// Signatures, Nimiq address derivation, and the random ids and friend codes.
//
// Two signature schemes live here:
//  - the WALLET signature: how Nimiq Pay signs a message. Ed25519 over sha256 of a prefixed buffer.
//    Verified on mainnet on 21 Nov 2026. Used once, at register, to prove the phone holds the wallet.
//  - the DEVICE signature: our own scheme for every other request. Plain Ed25519 over a canonical string.
//
// The only form of the wallet the server ever keeps is walletKey(address): an HMAC of the address with
// FRIENDS_SALT. The address itself and the wallet public key are never stored or returned.
import { randomBytes } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { blake2b } from '@noble/hashes/blake2.js'
import { hmac } from '@noble/hashes/hmac.js'

const HEX64 = /^[0-9a-f]{64}$/i
const HEX128 = /^[0-9a-f]{128}$/i

const toHex = (u8) => Buffer.from(u8).toString('hex')
const fromHex = (h) => new Uint8Array(Buffer.from(h, 'hex'))
const utf8 = (s) => new Uint8Array(Buffer.from(String(s), 'utf8'))
const concat = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

// sha256 of a UTF-8 string, lowercase hex. Used for the device signature's body hash.
export const sha256hex = (str) => toHex(sha256(utf8(str)))

// ---- wallet signature (Nimiq Pay) ---------------------------------------------------------------------------

// Nimiq Pay signs Ed25519 over sha256( 0x16 + "Nimiq Signed Message:\n" + String(byteLength) + messageBytes ),
// where messageBytes are the UTF-8 bytes of the text and byteLength is their count in decimal text.
const PREFIX = utf8('Nimiq Signed Message:\n') // its length is 0x16 = 22, hence the leading byte below
function nimiqMessageHash(message) {
  const msgBytes = utf8(message)
  return sha256(concat(Uint8Array.of(0x16), PREFIX, utf8(String(msgBytes.length)), msgBytes))
}

// verifyWalletSignature({ message, publicKey, signature }) -> boolean. Strict input checks before any crypto.
export function verifyWalletSignature({ message, publicKey, signature } = {}) {
  if (typeof message !== 'string' || typeof publicKey !== 'string' || typeof signature !== 'string') return false
  if (!HEX64.test(publicKey) || !HEX128.test(signature)) return false
  try {
    return ed25519.verify(fromHex(signature), nimiqMessageHash(message), fromHex(publicKey))
  } catch { return false }
}

// ---- Nimiq address from a public key ------------------------------------------------------------------------

const BASE32 = '0123456789ABCDEFGHJKLMNPQRSTUVXY' // Nimiq alphabet (no I, O, W, Z)
function base32(bytes) {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5 } }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

// IBAN-style checksum: letters to numbers (A=10..Z=35), then mod 97, kept small by chunking.
function ibanCheck(str) {
  const num = [...str].map((c) => { const code = c.toUpperCase().charCodeAt(0); return code >= 48 && code <= 57 ? c : String(code - 55) }).join('')
  let tmp = ''
  for (let i = 0; i < Math.ceil(num.length / 6); i++) tmp = String(Number(tmp + num.slice(i * 6, i * 6 + 6)) % 97)
  return Number(tmp)
}

// addressOf(publicKeyHex): blake2b-256 of the key, first 20 bytes, base32, with "NQ" + two check digits.
// Returned without spaces.
export function addressOf(publicKeyHex) {
  if (typeof publicKeyHex !== 'string' || !HEX64.test(publicKeyHex)) throw new Error('bad public key')
  const hash = blake2b(fromHex(publicKeyHex), { dkLen: 32 })
  const body = base32(hash.subarray(0, 20))
  const check = ('00' + (98 - ibanCheck(body + 'NQ00'))).slice(-2)
  return 'NQ' + check + body
}

// walletKey(address) = HMAC-SHA256 of the address with FRIENDS_SALT, hex. The only stored form of the wallet.
const DEV_SALT = 'dibs-friends-dev-salt-not-for-production'
const salt = () => process.env.FRIENDS_SALT || DEV_SALT
export function walletKey(address) {
  return toHex(hmac(sha256, utf8(salt()), utf8(address)))
}

// txKey(hash) = HMAC-SHA256 of the transaction hash with FRIENDS_SALT, hex, namespaced so it can never collide with a
// walletKey. The only form of a counted deposit the server keeps: the hash itself is never stored (board XP dedupe).
export function txKey(hash) {
  return toHex(hmac(sha256, utf8(salt()), utf8('tx:' + String(hash))))
}

// ---- device signature (our own request signing) -------------------------------------------------------------

// verifyDeviceSignature(devicePubHex, canonical, sigHex) -> boolean. Plain Ed25519 over the canonical UTF-8 bytes.
export function verifyDeviceSignature(devicePubHex, canonical, sigHex) {
  if (typeof devicePubHex !== 'string' || typeof sigHex !== 'string') return false
  if (!HEX64.test(devicePubHex) || !HEX128.test(sigHex)) return false
  try { return ed25519.verify(fromHex(sigHex), utf8(canonical), fromHex(devicePubHex)) } catch { return false }
}

export const isHex64 = (v) => typeof v === 'string' && HEX64.test(v)

// ---- ids and friend codes -----------------------------------------------------------------------------------

// User id: 128 random bits in a lowercase base32 with no confusable characters. Static forever; also the avatar seed.
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789' // 32 chars, no l, o, 0, 1
export function randomId() {
  const bytes = randomBytes(16)
  let bits = 0, value = 0, out = ''
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += ID_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 } }
  if (bits > 0) out += ID_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

// Friend code: "DIBS-" + n characters from an alphabet with no 0, O, 1, I.
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // 32 chars, unbiased from one byte
export function friendCode(len = 4) {
  const buf = randomBytes(len)
  let s = ''
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[buf[i] % 32]
  return 'DIBS-' + s
}
export const CODE_RE = /^DIBS-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4,5}$/
