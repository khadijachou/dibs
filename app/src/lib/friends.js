// Friends client: the device key, the two signatures, the API calls and the local state.
//
// Privacy: the device secret key (dibs.friends.key) and the demo wallet key (dibs.friends.demoWallet) never leave
// this module and are never sent anywhere. The wallet public key leaves the phone only inside the one signed
// register call. Nothing else about the wallet (address, balance, NIM amounts, goal names, dates) is ever sent.
//
// @noble is loaded only when a crypto function runs (dynamic import), so a phone with Friends off never downloads it
// and the first paint does not pay for it. With config.friendsUrl empty, every call is a no-op.
import { config } from './config.js'
import { describeError, isDemo, signMessage, readStaker, listAccountsWithBalance } from './nimiq.js'
import { xpSummary } from './xp.js'
import { getLook, accentChoice } from './looks.js'
import { BADGES, getBadges } from './badges.js'
import { listGoals } from './goals.js'
import { profileStats } from './profileStats.js'
import { sharedPayload } from './friendsShare.js'
import { giftGoalIds, reconcile, clearAll as clearGifts } from './gifts.js'

const TIMEOUT_MS = 6000 // most calls
export const REGISTER_TIMEOUT_MS = 45000 // the server can take up to ~50 s to answer the first request after idle
export const SEQ_TIMEOUTS = [6000, 15000, 25000] // loading a screen or a profile: retry quietly before giving up
export const FRIENDS_EVENT = 'dibs:friends'
const DEFAULT_VIS = { avatar: 'off', level: 'off', badges: 'off', totals: 'off', goals: 'off', cards: 'off', wishlist: 'off' }

const K = {
  main: 'dibs.friends', // { on, id, code, name, devicePub, since } (no secret here)
  key: 'dibs.friends.key', // the device secret key, hex (only this module reads it)
  vis: 'dibs.friends.vis', // the last known visibility map
  demo: 'dibs.friends.demoWallet', // the demo wallet secret key, hex (demo mode only)
  backSeen: 'dibs.friends.backSeen', // '1' once the "profile is back" sheet was shown
  pending: 'dibs.friends.pending', // a friend code from a ?friend link, kept until Friends is on
  lookSent: 'dibs.friends.lookSent', // the last look (accent, frame) sent to the server, so a sync re-sends only on a change
  enc: 'dibs.friends.enc', // the gift-box X25519 secret key, hex (lib/giftBox.js owns it; listed so Friends off clears it)
  encSent: 'dibs.friends.encSent', // the gift-box public key last registered with the server, to avoid re-sending it
}

// ---- storage ------------------------------------------------------------------------------------------------
const readJSON = (k, fallback = null) => { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v) } catch { return fallback } }
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }
const readStr = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const writeStr = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const del = (k) => { try { localStorage.removeItem(k) } catch { /* private mode */ } }
const notify = () => { try { window.dispatchEvent(new Event(FRIENDS_EVENT)) } catch { /* no window */ } }

export const enabled = () => Boolean(config.friendsUrl)
export const getState = () => readJSON(K.main, null)
export const isOn = () => Boolean(getState()?.on)
export const getVis = () => ({ ...DEFAULT_VIS, ...(readJSON(K.vis, null) || {}) })
export const getBackSeen = () => readStr(K.backSeen) === '1'
export const markBackSeen = () => writeStr(K.backSeen, '1')
export const getPendingCode = () => readStr(K.pending) || null
export const setPendingCode = (code) => { if (code) writeStr(K.pending, String(code)); else del(K.pending) }

// The invite message (no link, since a link opened the demo outside Nimiq Pay): the code and where to type it.
// Pure, so shareInvite and its test share it. Keeps the {code} placeholder in frd_share_text.
export const inviteText = (t, code) => t('frd_share_text', { code })

// How many of the seven shared items are on (not 'off'). Unknown keys are ignored. Used by the "Who sees what" rows.
const VIS_KEYS = ['avatar', 'level', 'badges', 'totals', 'goals', 'cards', 'wishlist']
export const visSummary = (vis) => ({ n: VIS_KEYS.filter((k) => vis && vis[k] && vis[k] !== 'off').length })
const clearAll = () => { for (const k of Object.values(K)) del(k) }

// ---- crypto (loaded on demand) ------------------------------------------------------------------------------
const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (h) => { const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return a }
const utf8 = (s) => new TextEncoder().encode(String(s))
const concat = (...ps) => { const n = ps.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of ps) { o.set(p, i); i += p.length } return o }
const randomHex = (n) => { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return toHex(a) }

let _lib = null
async function lib() {
  if (_lib) return _lib
  const [{ ed25519 }, { sha256 }] = await Promise.all([import('@noble/curves/ed25519.js'), import('@noble/hashes/sha2.js')])
  _lib = { ed25519, sha256 }
  return _lib
}
const sha256hex = (sha256, str) => toHex(sha256(utf8(str)))

// The exact register message (also the format the server checks).
export const registerMessage = (devicePub, iso) => `Dibs Friends: link this wallet\nDevice: ${devicePub}\nTime: ${iso}`
// The exact canonical string signed by the device key.
export const canonicalString = (method, pathWithQuery, ts, nonce, bodyHash) => `${method}\n${pathWithQuery}\n${ts}\n${nonce}\n${bodyHash}`
// The Nimiq signed-message hash (used to sign with the demo wallet, same format as Nimiq Pay).
const nimiqHash = (sha256, message) => { const m = utf8(message); return sha256(concat(Uint8Array.of(0x16), utf8('Nimiq Signed Message:\n'), utf8(String(m.length)), m)) }

const fail = (code, status = 0) => { const e = new Error(code); e.friendsError = code; e.status = status; return e }

// ---- HTTP ---------------------------------------------------------------------------------------------------
async function doFetch(method, path, bodyText, headers, timeout = TIMEOUT_MS) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  let r
  try {
    r = await fetch(`${config.friendsUrl}${path}`, { method, headers, body: method === 'GET' ? undefined : bodyText, signal: ctl.signal })
  } catch {
    throw fail('SRV_DOWN') // network error or the 6 s timeout aborted it
  } finally { clearTimeout(timer) }
  if (r.status === 401) { onUnauthorized(); throw fail('UNAUTHORIZED', 401) }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw fail(/^[A-Z_]+$/.test(data?.error || '') ? data.error : 'GENERIC', r.status)
  return data
}

// One signed request for every route but register. Signs with the device key as the README describes.
export async function request(method, path, body, { timeout = TIMEOUT_MS } = {}) {
  if (!config.friendsUrl) throw fail('NOT_CONFIGURED')
  const skHex = readStr(K.key)
  const st = getState()
  if (!skHex || !st?.id) throw fail('NOT_ON')
  const { ed25519, sha256 } = await lib()
  const bodyText = body === undefined ? '' : JSON.stringify(body)
  const ts = Date.now()
  const nonce = randomHex(16)
  const canonical = canonicalString(method, path, ts, nonce, sha256hex(sha256, bodyText))
  const sig = toHex(ed25519.sign(utf8(canonical), fromHex(skHex)))
  const headers = { 'X-Dibs-Id': st.id, 'X-Dibs-Ts': String(ts), 'X-Dibs-Nonce': nonce, 'X-Dibs-Sig': sig }
  if (method !== 'GET') headers['content-type'] = 'application/json'
  return doFetch(method, path, bodyText, headers, timeout)
}

// For loading a screen or a profile: keep trying with growing timeouts (6 s, 15 s, 25 s) while the server is just slow
// to wake up, and only give up on the last one. A definite error (401, BAD_CODE, ...) is not retried.
export async function requestSeq(method, path, body, timeouts = SEQ_TIMEOUTS) {
  let lastErr
  for (const timeout of timeouts) {
    try { return await request(method, path, body, { timeout }) }
    catch (e) { if (e.friendsError !== 'SRV_DOWN') throw e; lastErr = e }
  }
  throw lastErr
}

// A 401 on a signed call means this device key is unknown (for example the profile was deleted elsewhere):
// go back to Off locally, keep the wishlist, no retry loop.
function onUnauthorized() {
  const st = getState()
  if (st?.on) { writeJSON(K.main, { ...st, on: false }); notify() }
}

// ---- turn on / off ------------------------------------------------------------------------------------------
export async function turnOn(name) {
  if (!config.friendsUrl) throw fail('NOT_CONFIGURED')
  const { ed25519, sha256 } = await lib()
  const existingKey = readStr(K.key)
  const devSk = existingKey ? fromHex(existingKey) : ed25519.utils.randomSecretKey()
  const devicePub = toHex(ed25519.getPublicKey(devSk))
  const message = registerMessage(devicePub, new Date().toISOString())

  let wallet
  let demoHex = null
  if (isDemo()) {
    const existingDemo = readStr(K.demo)
    const dwSk = existingDemo ? fromHex(existingDemo) : ed25519.utils.randomSecretKey()
    demoHex = toHex(dwSk)
    wallet = { message, publicKey: toHex(ed25519.getPublicKey(dwSk)), signature: toHex(ed25519.sign(nimiqHash(sha256, message), dwSk)) }
  } else {
    let res
    try { res = await signMessage(message) } catch (e) { throw describeError(e).type === 'PERMISSION_DENIED' ? fail('SIGN_REFUSED') : fail('SIGN_FAILED') }
    if (!res?.publicKey || !res?.signature) throw fail('SIGN_FAILED')
    wallet = { message, publicKey: String(res.publicKey), signature: String(res.signature) }
  }

  const out = await doFetch('POST', '/v1/register', JSON.stringify({ name, devicePub, wallet }), { 'content-type': 'application/json' }, REGISTER_TIMEOUT_MS)

  // Success: persist the keys and the state (nothing was written before this, so a refusal leaves storage untouched).
  writeStr(K.key, toHex(devSk))
  if (demoHex) writeStr(K.demo, demoHex)
  writeJSON(K.main, { on: true, id: out.id, code: out.code, name: out.name, devicePub, since: new Date().toISOString() })
  writeJSON(K.vis, out.visibility || DEFAULT_VIS)
  setPendingCode(null)
  notify()
  return out
}

// The "add this wallet" message, the same three-line shape as registration; the Device line binds it to this device.
export const addWalletMessage = (devicePub, iso) => `Dibs Friends: add this wallet\nDevice: ${devicePub}\nTime: ${iso}`

// Link another of the wallet's addresses (v1.7.11): ask Nimiq Pay to sign "add this wallet" with the address deposits
// are paid from (the staking address Dibs saves from), then POST it. Returns the server's { wallets } count. Throws on a
// refusal or failure; the caller stays quiet, since a refusal changes nothing. In demo mode the one demo wallet signs.
export async function addWallet() {
  if (!config.friendsUrl) throw fail('NOT_CONFIGURED')
  const st = getState()
  if (!isOn() || !st?.devicePub) throw fail('NOT_ON')
  const { ed25519, sha256 } = await lib()
  const message = addWalletMessage(st.devicePub, new Date().toISOString())
  let wallet
  if (isDemo()) {
    const dwSk = fromHex(readStr(K.demo) || toHex(ed25519.utils.randomSecretKey()))
    wallet = { message, publicKey: toHex(ed25519.getPublicKey(dwSk)), signature: toHex(ed25519.sign(nimiqHash(sha256, message), dwSk)) }
  } else {
    let res
    try { res = await signMessage(message) } catch (e) { throw describeError(e).type === 'PERMISSION_DENIED' ? fail('SIGN_REFUSED') : fail('SIGN_FAILED') }
    if (!res?.publicKey || !res?.signature) throw fail('SIGN_FAILED')
    wallet = { message, publicKey: String(res.publicKey), signature: String(res.signature) }
  }
  return request('POST', '/v1/me/wallets', { wallet })
}

// deleteProfile true calls DELETE /v1/me first; a failed call throws and keeps everything.
export async function turnOff({ deleteProfile } = {}) {
  if (deleteProfile) await request('DELETE', '/v1/me')
  clearAll()
  clearGifts() // the local gift tags go too (the server dropped the claims on delete)
  // The leaderboards state is local to this device; drop it so a later turn-on starts clean (keys from lib/boards.js).
  for (const k of ['dibs.boards', 'dibs.boardsQueue', 'dibs.boardsCardHidden', 'dibs.boardsLastReason', 'dibs.boardsWallets']) del(k)
  notify()
}

// ---- API (all signed) ---------------------------------------------------------------------------------------
export const me = () => request('GET', '/v1/me')
export const asFriend = () => request('GET', '/v1/me/as-friend')
export const getFriends = () => request('GET', '/v1/friends')
export const lookup = (code) => request('GET', `/v1/lookup?code=${encodeURIComponent(code)}`)
export const sendInvite = (code) => request('POST', '/v1/invites', { code })
export const acceptInvite = (id) => request('POST', `/v1/invites/${encodeURIComponent(id)}/accept`)
export const declineInvite = (id) => request('DELETE', `/v1/invites/${encodeURIComponent(id)}`)
export const removeFriend = (id) => request('DELETE', `/v1/friends/${encodeURIComponent(id)}`)
export const userProfile = (id) => request('GET', `/v1/users/${encodeURIComponent(id)}`)
// Loading variants that retry quietly while the server wakes up (used by the Friends screen and profiles).
export const loadFriends = () => requestSeq('GET', '/v1/friends')
export const loadProfile = (id) => requestSeq('GET', `/v1/users/${encodeURIComponent(id)}`)
export const loadAsFriend = () => requestSeq('GET', '/v1/me/as-friend')

// PATCH my identity (name / visibility / look). Keeps the local name and visibility in step.
export async function patchMe(patch) {
  const out = await request('PATCH', '/v1/me', patch)
  const st = getState()
  if (st) writeJSON(K.main, { ...st, name: out.name ?? st.name })
  if (out.visibility) writeJSON(K.vis, out.visibility)
  notify()
  return out
}

// Upload the shared data for the items that are on. Silent on failure (callers outside Friends screens ignore it).
// walletAddress is the stable listAccounts()[0] (the one the Nimiq identicon is drawn from); it is resolved here when
// not passed (App.jsx's launch sync passes only `address`). The address itself is never part of any request.
const getWishlist = () => { const v = readJSON('dibs.wishlist', []); return Array.isArray(v) ? v : [] }

// The totals (saved, earned) from the same source Savings uses; earned is null when the chain cannot give it reliably.
async function gatherTotals(address) {
  const saved = Math.floor(profileStats(listGoals(address)).totalSaved)
  let earned = null
  try {
    const { stakeSummary } = await import('./earned.js') // heavy (chain, React deps): loaded only when totals are shared
    const st = await readStaker(address).catch(() => null)
    const e = stakeSummary(st, address).earned
    if (typeof e === 'number' && Number.isFinite(e)) earned = Math.floor(e)
  } catch { /* chain unreadable or earning on hold: omit earned, never guess */ }
  return { saved, earned }
}

// My Nimiq avatar as a data URL: the identicon library draws it from walletAddress on the phone; the address is
// never sent. Avatar.jsx keeps the SVG small, else a 64 px PNG. Loaded lazily (it is a .jsx with the identicon lib).
async function gatherAvatar(walletAddress) {
  try {
    const wa = walletAddress || (await listAccountsWithBalance())[0]?.address
    if (!wa) return undefined
    const { myAvatarUrl } = await import('../components/Avatar.jsx')
    return await myAvatarUrl(wa)
  } catch { return undefined }
}

// R1 (privacy): a frame or an accent tells others your rank, so the look is sent only while "Level and rank" is set to
// Friends or Everyone. When it is Off, {} is sent and friends see the default. Only accent and frame leave the phone;
// the goal-ring style is never sent (friends do not see your goal rings). ring/unknown ids are dropped by the server.
function lookToSend(address) {
  const vis = getVis()
  if (vis.level !== 'friends' && vis.level !== 'everyone') return {}
  // Only an accent the user actually chose is sent (accentChoice), so a never-chosen name stays normal on friends'
  // phones too. A friend on an old build still sends 'coral', which reads as coral there: sensible, not wrong.
  try {
    const level = xpSummary({ goals: listGoals(address), badges: getBadges() }).level
    const accent = accentChoice(level)
    return accent ? { accent, frame: getLook(level).frame } : { frame: getLook(level).frame }
  } catch { return {} }
}
// PATCH the look only when it differs from what was last sent (on an equip change, a visibility change, or the
// once-per-launch sync). Throws on a failed call; callers that must stay quiet use syncLookQuiet.
async function pushLookIfChanged(address) {
  if (!isOn() || !config.friendsUrl) return
  const look = lookToSend(address)
  const last = readJSON(K.lookSent, null)
  if (last && JSON.stringify(last) === JSON.stringify(look)) return
  await patchMe({ look })
  writeJSON(K.lookSent, look)
}
export const syncLookQuiet = (address) => { pushLookIfChanged(address).catch(() => { /* silent outside Friends screens */ }) }

// Register this phone's gift-box public key so a friend can seal a gift card code for it (v1.7.3). One signed PUT, only
// when the server does not already have this key (tracked in encSent), and quiet on failure: a gift can still be shared
// with the fallback share sheet. Called once per launch and after turn-on. The private key never leaves lib/giftBox.js.
export async function ensureEncKey() {
  if (!isOn() || !config.friendsUrl) return
  const { encPub } = await import('./giftBox.js')
  const pub = await encPub()
  if (readStr(K.encSent) === pub) return
  await request('PUT', '/v1/me/enc-key', { encPub: pub })
  writeStr(K.encSent, pub)
}
export const ensureEncKeyQuiet = () => { ensureEncKey().catch(() => { /* fall back to the share sheet */ }) }

export async function syncShared(address, walletAddress) {
  if (!isOn() || !config.friendsUrl) return null
  syncLookQuiet(address) // keep the shared look (accent, frame) in step with the level-and-rank visibility (R1)
  await reconcile(listGoals(address)) // drop and release claims whose gift goal is gone, withdrawn or changed card
  const vis = getVis()
  const on = (k) => vis[k] === 'friends' || vis[k] === 'everyone'
  const s = xpSummary({ goals: listGoals(address), badges: getBadges() })
  const earnedBadges = Object.keys(getBadges()).filter((id) => BADGES.some((b) => b.id === id))
  const { saved, earned } = on('totals') ? await gatherTotals(address) : {}
  const avatar = on('avatar') ? await gatherAvatar(walletAddress) : undefined
  const body = sharedPayload({
    visibility: vis, xp: { level: s.level, rank: s.rank.id, total: s.xp }, badges: earnedBadges,
    goals: listGoals(address), wishlist: getWishlist(), saved, earned, avatar, giftGoalIds: giftGoalIds(),
  })
  return request('PUT', '/v1/me/shared', body)
}
// Fire-and-forget sync (after turn-on, after a visibility change, once per launch). Never throws to the caller.
export const syncQuiet = (address, walletAddress) => { syncShared(address, walletAddress).catch(() => { /* silent outside Friends screens */ }) }
