// Leaderboards client (v1.7): join and leave the boards, read them, and report confirmed deposits so the server can
// check them on the chain and count their XP. Built on the Friends client (lib/friends.js) for the signed requests.
//
// Privacy: a deposit hash is sent ONLY while the user is on a board. The small queue (dibs.boardsQueue) keeps hashes on
// the phone, retries them on the next launch, and drops them after 3 days. With Friends off or the server down, nothing
// breaks and nothing is shown.
import { config } from './config.js'
import { request, requestSeq, isOn, addWallet } from './friends.js'
import { txHash } from './history.js'

const K = {
  state: 'dibs.boards', // { friends: bool, global: bool } local mirror of the server choice
  queue: 'dibs.boardsQueue', // [{ tx, at }] deposit hashes waiting to be reported
  cardHidden: 'dibs.boardsCardHidden', // '1' once the Profile card's "Not now" was tapped
  lastReason: 'dibs.boardsLastReason', // the last server answer for a reported deposit (diagnostics only, never a hash)
  wallets: 'dibs.boardsWallets', // how many wallet addresses are linked (diagnostics only, never an address)
}
const HEX64 = /^[0-9a-f]{64}$/i
export const BOARDS_EVENT = 'dibs:boards'
const DROP_AFTER = 3 * 864e5 // a queued hash older than 3 days is dropped unsent
const MAX_QUEUE = 50

const readJSON = (k, fb = null) => { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v) } catch { return fb } }
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }
const readStr = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const writeStr = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const notify = () => { try { window.dispatchEvent(new Event(BOARDS_EVENT)) } catch { /* no window */ } }

// Boards only exist when Friends is configured and on.
export const enabled = () => Boolean(config.friendsUrl)
export const getBoardsState = () => { const s = readJSON(K.state, null); return s && typeof s === 'object' ? s : null }
export const onAnyBoard = () => { const s = getBoardsState(); return Boolean(s && (s.friends || s.global)) }
// Deposit XP only feeds the Global board (the Friends board ranks by Profile XP), so a deposit hash is reported only
// while the Global board is joined.
export const onGlobal = () => Boolean(getBoardsState()?.global)
export const cardHidden = () => readStr(K.cardHidden) === '1'
export const hideCard = () => { writeStr(K.cardHidden, '1'); notify() }
// Called when Friends is turned off / deleted: forget the local board state (the server already dropped it).
export const clearBoards = () => { try { for (const k of [K.state, K.queue, K.cardHidden, K.lastReason, K.wallets]) localStorage.removeItem(k) } catch { /* ignore */ } }
// How many wallet addresses are linked, for diagnostics (null when never read from the server).
export const walletsLinked = () => { const v = readStr(K.wallets); return v == null ? null : Number(v) }

// ---- join / leave -------------------------------------------------------------------------------------------

// Set the board choice on the server and mirror it locally. Throws like any signed request.
export async function setBoards({ friends, global }) {
  const out = await request('PUT', '/v1/me/boards', { friends: Boolean(friends), global: Boolean(global) })
  const next = out?.boards || { friends: Boolean(friends), global: Boolean(global) }
  writeJSON(K.state, next)
  notify()
  if (next.friends || next.global) flushQueue() // a freshly joined board can take any queued hashes now
  return next
}

// Refresh the local mirror from the server (GET /v1/me carries the board choice). Quiet: never throws to the caller.
export async function refreshBoards() {
  if (!isOn() || !config.friendsUrl) return null
  try {
    const me = await request('GET', '/v1/me')
    if (me?.boards) { writeJSON(K.state, me.boards); notify() }
    if (typeof me?.wallets === 'number') writeStr(K.wallets, String(me.wallets))
    return me?.boards || null
  } catch { return null }
}

// ---- reading the boards -------------------------------------------------------------------------------------
export const friendsBoard = () => requestSeq('GET', '/v1/boards/friends')
export const globalBoard = () => requestSeq('GET', '/v1/boards/global')

// ---- the deposit queue --------------------------------------------------------------------------------------

// The last server answer for a reported deposit (its reason word, never a hash). Diagnostics only.
export const lastReason = () => readStr(K.lastReason)
const noteReason = (reason) => { if (reason) writeStr(K.lastReason, String(reason)) }

const addToQueue = (tx, at) => {
  const low = String(tx).toLowerCase()
  if (!HEX64.test(low)) return false
  const list = readJSON(K.queue, [])
  const q = Array.isArray(list) ? list : []
  if (q.some((e) => e && String(e.tx).toLowerCase() === low)) return false
  q.push({ tx: low, at: at || Date.now() })
  writeJSON(K.queue, q.slice(-MAX_QUEUE))
  return true
}

// Queue a confirmed deposit's hash, only while the Global board is joined. Then try to send it right away. Returns the
// flush promise (handy in tests); callers in the app do not await it.
export function queueDeposit(tx) {
  if (!tx || !config.friendsUrl || !isOn() || !onGlobal()) return
  if (addToQueue(txHash(tx), Date.now())) return flushQueue()
}

// At launch (Global joined): queue every real deposit of the current UTC month that carries a tx hash, from the goal
// ledger. The server dedupes (an already counted one answers duplicate), so this also recovers deposits that were
// reported before the at-once check existed. Moves, withdrawals and kept-NIM rows are not deposits and are skipped.
// Each is queued with a fresh timestamp so the 3-day drop never discards a recovered one before it is sent once.
export function queueMonthDeposits(goals, now = Date.now()) {
  if (!config.friendsUrl || !isOn() || !onGlobal()) return
  const month = new Date(now).toISOString().slice(0, 7)
  let added = false
  for (const g of Array.isArray(goals) ? goals : []) {
    for (const d of (g && Array.isArray(g.deposits) ? g.deposits : [])) {
      if (!d || d.kind || !(d.nim > 0)) continue // real deposits only (no move / withdraw / kept)
      const tx = txHash(d.tx)
      if (!HEX64.test(tx)) continue
      const at = Date.parse(d.at)
      if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 7) !== month) continue // this UTC month only
      if (addToQueue(tx, now)) added = true
    }
  }
  if (added) return flushQueue()
}

// Link the address deposits are paid from (v1.7.11): when the Global board answers wrong_from, the deposits come from
// another address of the same wallet than the one Friends was registered with. Ask Nimiq Pay to sign, add the key on the
// server, remember the new wallet count, then re-report this month's deposits so they count. A refusal throws (the caller
// stays quiet and nothing changes). Only meaningful while the Global board is joined.
export async function linkDepositAddress(goals, now = Date.now()) {
  if (!config.friendsUrl || !isOn() || !onGlobal()) return null
  const out = await addWallet() // signs in Nimiq Pay; throws on a refusal
  if (out && typeof out.wallets === 'number') writeStr(K.wallets, String(out.wallets))
  await queueMonthDeposits(goals, now) // the newly linked address's deposits now count
  return out
}

// Report the queued hashes. Dropped: older than 3 days, counted, duplicate, or refused for good (wrong wallet, wrong
// target, before the join, not this month, the daily cap, a bad hash). Kept for the next launch: the chain does not show
// the deposit yet (not_found_yet), the server is down, or the user is not on a board right now. Quiet throughout.
let flushing = false
export async function flushQueue() {
  if (flushing || !config.friendsUrl || !isOn()) return
  const list = readJSON(K.queue, [])
  if (!Array.isArray(list) || !list.length) return
  flushing = true
  const now = Date.now()
  const joined = onGlobal()
  const kept = []
  try {
    for (const e of list) {
      if (!e || !e.tx) continue
      if (now - (e.at || 0) > DROP_AFTER) continue // too old
      if (!joined) { kept.push(e); continue } // never send a hash when the Global board is not joined
      try {
        const res = await request('POST', '/v1/me/xp/deposit', { tx: e.tx })
        noteReason(res?.reason)
        if (res?.reason === 'not_found_yet') kept.push(e) // not on the chain yet: retry at the next launch
        // counted, duplicate or any final refusal: drop it
      } catch (err) {
        const code = err?.friendsError
        noteReason(code || 'error')
        if (code === 'SRV_DOWN' || code === 'LIMIT' || code === 'NOT_ON_BOARD') kept.push(e) // transient: retry later
        // any other error (BAD_REQUEST, UNAUTHORIZED): drop it
      }
    }
    writeJSON(K.queue, kept)
  } finally { flushing = false }
}
