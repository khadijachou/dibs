// Leaderboards client (v1.7): join and leave the boards, read them, and report confirmed deposits so the server can
// check them on the chain and count their XP. Built on the Friends client (lib/friends.js) for the signed requests.
//
// Privacy: a deposit hash is sent ONLY while the user is on a board. The small queue (dibs.boardsQueue) keeps hashes on
// the phone, retries them on the next launch, and drops them after 3 days. With Friends off or the server down, nothing
// breaks and nothing is shown.
import { config } from './config.js'
import { request, requestSeq, isOn } from './friends.js'

const K = {
  state: 'dibs.boards', // { friends: bool, global: bool } local mirror of the server choice
  queue: 'dibs.boardsQueue', // [{ tx, at }] deposit hashes waiting to be reported
  cardHidden: 'dibs.boardsCardHidden', // '1' once the Profile card's "Not now" was tapped
}
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
export const cardHidden = () => readStr(K.cardHidden) === '1'
export const hideCard = () => { writeStr(K.cardHidden, '1'); notify() }
// Called when Friends is turned off / deleted: forget the local board state (the server already dropped it).
export const clearBoards = () => { try { localStorage.removeItem(K.state); localStorage.removeItem(K.queue); localStorage.removeItem(K.cardHidden) } catch { /* ignore */ } }

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
    return me?.boards || null
  } catch { return null }
}

// ---- reading the boards -------------------------------------------------------------------------------------
export const friendsBoard = () => requestSeq('GET', '/v1/boards/friends')
export const globalBoard = () => requestSeq('GET', '/v1/boards/global')

// ---- the deposit queue --------------------------------------------------------------------------------------

// Queue a confirmed deposit's hash, only while on a board. Then try to send it right away.
export function queueDeposit(tx) {
  if (!tx || !config.friendsUrl || !isOn() || !onAnyBoard()) return
  const list = readJSON(K.queue, [])
  const q = Array.isArray(list) ? list : []
  if (q.some((e) => e && e.tx === tx)) return
  q.push({ tx, at: Date.now() })
  writeJSON(K.queue, q.slice(-MAX_QUEUE))
  flushQueue()
}

// Report the queued hashes. Dropped: older than 3 days, sent, or refused for good (a bad hash, unauthorized). Kept for
// the next launch: the server is down, or the user is not on a board right now (nothing is sent in that case). Quiet.
let flushing = false
export async function flushQueue() {
  if (flushing || !config.friendsUrl || !isOn()) return
  const list = readJSON(K.queue, [])
  if (!Array.isArray(list) || !list.length) return
  flushing = true
  const now = Date.now()
  const joined = onAnyBoard()
  const kept = []
  try {
    for (const e of list) {
      if (!e || !e.tx) continue
      if (now - (e.at || 0) > DROP_AFTER) continue // too old
      if (!joined) { kept.push(e); continue } // never send a hash when not joined
      try {
        await request('POST', '/v1/me/xp/deposit', { tx: e.tx })
      } catch (err) {
        const code = err?.friendsError
        if (code === 'SRV_DOWN' || code === 'LIMIT' || code === 'NOT_ON_BOARD') kept.push(e) // transient: retry later
        // any other error (BAD_REQUEST, UNAUTHORIZED): drop it
      }
    }
    writeJSON(K.queue, kept)
  } finally { flushing = false }
}
