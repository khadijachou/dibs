// Leaderboards client (v1.7): join and leave the boards and read them. Built on the Friends client (lib/friends.js) for
// the signed requests. The Friends board ranks by Profile XP; the Global board ranks by level (v1.7.12). The app no
// longer reports deposits: no transaction hash ever leaves the phone for leaderboards.
import { config } from './config.js'
import { request, requestSeq, isOn } from './friends.js'

const K = {
  state: 'dibs.boards', // { friends: bool, global: bool } local mirror of the server choice
  queue: 'dibs.boardsQueue', // left over deposit hashes from before v1.7.12; cleared once and never written again
  cardHidden: 'dibs.boardsCardHidden', // '1' once the Profile card's "Not now" was tapped
}
export const BOARDS_EVENT = 'dibs:boards'

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
export const clearBoards = () => { try { for (const k of [K.state, K.queue, K.cardHidden, 'dibs.boardsLastReason', 'dibs.boardsWallets']) localStorage.removeItem(k) } catch { /* ignore */ } }
// Drop any deposit hashes left over from before v1.7.12 (the app no longer reports deposits). Called once at launch.
export const clearQueue = () => { try { localStorage.removeItem(K.queue) } catch { /* ignore */ } }

// ---- join / leave -------------------------------------------------------------------------------------------

// Set the board choice on the server and mirror it locally. Throws like any signed request.
export async function setBoards({ friends, global }) {
  const out = await request('PUT', '/v1/me/boards', { friends: Boolean(friends), global: Boolean(global) })
  const next = out?.boards || { friends: Boolean(friends), global: Boolean(global) }
  writeJSON(K.state, next)
  notify()
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
