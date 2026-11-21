// Gift box: end-to-end encryption of a gift card redemption ({ code, pin, link }) so the Friends server can relay it to
// a friend without ever reading it. X25519 (ECDH) + HKDF-SHA256 + AES-256-GCM, all through @noble (already used for the
// device key) and WebCrypto crypto.subtle. No new dependency.
//
// Privacy: the X25519 private key (dibs.friends.enc) never leaves this phone. Only the public key is registered with the
// Friends server, which hands it to a giver who holds a claim so they can seal a box for it. @noble is loaded on demand
// (dynamic import), so a phone that never sends or opens a gift never downloads it.
//
// The box is { to, eph, iv, ct } in base64url: `to` is the recipient public key the giver sealed for, `eph` the
// ephemeral public key, `iv` the 12-byte AES-GCM nonce, `ct` the ciphertext+tag. The additional data (aad) binds the box
// to `${ownerId}:${brandKey}:${giverId}` so a box cannot be replayed onto another wish or claimed by another giver.

const ENC_KEY = 'dibs.friends.enc' // the X25519 secret key, hex (only this module reads it); cleared with Friends off/delete
const INFO = 'dibs-gift-v1'

// ---- bytes / encodings --------------------------------------------------------------------------------------------
const subtle = globalThis.crypto.subtle
const utf8 = (s) => new TextEncoder().encode(String(s))
const randomBytes = (n) => { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return a }
const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (h) => { const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return a }
const b64url = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const fromB64url = (str) => { const s = String(str).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8 }
// A public key as bytes, accepting hex (64 chars) or base64url (what this app registers).
const keyBytes = (s) => (/^[0-9a-fA-F]{64}$/.test(String(s)) ? fromHex(s) : fromB64url(s))

const readStr = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const writeStr = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

// ---- @noble (loaded on demand) -----------------------------------------------------------------------------------
let _c = null
async function lib() {
  if (_c) return _c
  const [{ x25519 }, { hkdf }, { sha256 }] = await Promise.all([
    import('@noble/curves/ed25519.js'), import('@noble/hashes/hkdf.js'), import('@noble/hashes/sha2.js'),
  ])
  _c = { x25519, hkdf, sha256 }
  return _c
}

// ---- the stored key pair -----------------------------------------------------------------------------------------
// This phone's X25519 key pair, creating it on first use. Returns { priv, pub, pubB64 }. The private key is stored hex
// and never sent; pubB64 is the base64url public key the app registers and the giver seals for.
export async function encKeys() {
  const { x25519 } = await lib()
  const hex = readStr(ENC_KEY)
  let priv
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) priv = fromHex(hex)
  else { priv = x25519.utils.randomSecretKey(); writeStr(ENC_KEY, toHex(priv)) }
  const pub = x25519.getPublicKey(priv)
  return { priv, pub, pubB64: b64url(pub) }
}

// The base64url public key to register (creates the key pair on first use).
export const encPub = async () => (await encKeys()).pubB64

// Only the fields that exist, in a fixed order, so the plaintext is small and deterministic.
const plaintextOf = (r) => { const o = {}; for (const k of ['code', 'pin', 'link']) if (r && r[k]) o[k] = String(r[k]); return o }

// ---- seal / open -------------------------------------------------------------------------------------------------
// Seal a redemption for `recipientPub` (hex or base64url). aad binds the box to `${ownerId}:${brandKey}:${giverId}`.
// Returns { to: recipientPub, eph, iv, ct } in base64url. Each call uses a fresh ephemeral pair and IV, so two seals of
// the same code never match.
export async function seal(redemption, recipientPub, aad) {
  const { x25519, hkdf, sha256 } = await lib()
  const ephPriv = x25519.utils.randomSecretKey()
  const ephPub = x25519.getPublicKey(ephPriv)
  const shared = x25519.getSharedSecret(ephPriv, keyBytes(recipientPub))
  const key = hkdf(sha256, shared, ephPub, utf8(INFO), 32)
  const iv = randomBytes(12)
  const aesKey = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt'])
  const plain = utf8(JSON.stringify(plaintextOf(redemption)))
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad) }, aesKey, plain))
  return { to: recipientPub, eph: b64url(ephPub), iv: b64url(iv), ct: b64url(ct) }
}

// Open a box with this phone's private key. aad must match the one used to seal. Throws on any mismatch (wrong key,
// changed aad, tampered ciphertext): AES-GCM authentication fails and crypto.subtle rejects.
export async function open(box, aad) {
  const { x25519, hkdf, sha256 } = await lib()
  const { priv } = await encKeys()
  const eph = keyBytes(box.eph)
  const shared = x25519.getSharedSecret(priv, eph)
  const key = hkdf(sha256, shared, eph, utf8(INFO), 32)
  const aesKey = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt'])
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(box.iv), additionalData: utf8(aad) }, aesKey, fromB64url(box.ct))
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)))
}
