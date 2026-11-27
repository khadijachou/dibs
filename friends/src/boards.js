// Leaderboards (v1.7): opt-in Friends and Global boards, ranked by XP the server has checked, this UTC month only.
//
// The only XP the server trusts is deposit XP, because it can verify a deposit on the chain by its transaction hash:
// executed, sent to the staking contract, and sent from the user's own linked wallet (walletKey, never the address).
// Purchases, quests, badges, shares and daily opens cannot be checked without trusting the phone, so they never count
// here. The board has its own XP, by the app's own deposit rule: 10 XP per counted deposit (max 3 a day) + 5 XP per
// 1,000 NIM crossed in the user's cumulative deposited NIM for the month, counted from the day the user joined.
//
// Privacy: a counted deposit is remembered only as HMAC(hash, FRIENDS_SALT) (txKey), never the hash and never an
// address. The per-month record holds only { xp, nim, days: { 'YYYY-MM-DD': count } }. Old months expire on their own.
import { walletKey, txKey } from './crypto.js'

export const BOARDS = ['friends', 'global']
const STAKING_CONTRACT = 'NQ77 0000 0000 0000 0000 0000 0000 0000 0001' // every add-stake tx's `to` (matches stats.js)
const LUNA = 100_000
const DEPOSITS_PER_DAY = 3
const XP_DEPOSIT = 10
const XP_THOUSAND = 5
const MONTH_SECONDS = 70 * 24 * 60 * 60 // keep a month record ~2 months after its last write, then it expires

const boardKey = (b) => `fr:board:${b}` // a set of user ids on board b (scanned to build the board)
const xpKey = (id, month) => `fr:xp:${id}:${month}` // { xp, nim, days } for one user in one UTC month
const monthsKey = (id) => `fr:xpm:${id}` // the set of months this user has a record for (so delete can clear them all)
const seenKey = (hash) => `fr:xptx:${txKey(hash)}` // dedupe: a counted deposit, as a salted fingerprint of its hash

// UTC month ('YYYY-MM') and day ('YYYY-MM-DD') of a timestamp in ms.
export const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7)
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10)
const stripSpaces = (a) => String(a || '').replace(/\s+/g, '')
// The chain returns a transaction timestamp in milliseconds; accept seconds too, defensively.
function txTimestampMs(tx) {
  const t = tx?.timestamp
  if (typeof t === 'number' && Number.isFinite(t)) return t < 1e12 ? t * 1000 : t
  const p = Date.parse(t)
  return Number.isFinite(p) ? p : null
}

// ---- membership ---------------------------------------------------------------------------------------------

// The wallet keys a user has linked, the registration one first. Old users (before v1.7.11) carry only `wk`; new users
// carry `wks` (an array). A deposit counts when its from-address hashes to any of these. Never an address, only keys.
export const walletKeys = (u) => (Array.isArray(u?.wks) && u.wks.length ? u.wks : (u?.wk ? [u.wk] : []))

// The boards a user is on, as booleans, from the user record's `boards` map ({ friends?: iso, global?: iso }).
export const boardsChoice = (u) => ({ friends: Boolean(u?.boards?.friends), global: Boolean(u?.boards?.global) })
export const onAnyBoard = (u) => BOARDS.some((b) => u?.boards?.[b])
// The earliest join time across the boards the user is currently on (XP before it does not count). null when on none.
export function joinedAtMs(u) {
  const times = BOARDS.filter((b) => u?.boards?.[b]).map((b) => Date.parse(u.boards[b])).filter(Number.isFinite)
  return times.length ? Math.min(...times) : null
}

// Apply a { friends, global } choice to the user record and the board sets. Joining sets joinedAt once (first join);
// leaving removes the user from that board at once. Mutates and returns u.boards. `now` is injectable for tests.
export async function setBoards(store, u, want, now = Date.now()) {
  const next = { ...(u.boards || {}) }
  for (const b of BOARDS) {
    if (want[b]) {
      if (!next[b]) next[b] = new Date(now).toISOString() // first join only
      await store.sadd(boardKey(b), u.id)
    } else {
      delete next[b]
      await store.srem(boardKey(b), u.id)
    }
  }
  u.boards = next
  return next
}

export const boardMembers = (store, b) => store.smembers(boardKey(b))

// The user's checked XP for a month (0 when there is no record).
export async function xpOf(store, id, month) {
  const rec = await store.get(xpKey(id, month))
  return rec?.xp || 0
}

// Remove a user from every board and drop all their monthly XP records (used by DELETE /v1/me).
export async function dropBoardsFor(store, id) {
  for (const b of BOARDS) await store.srem(boardKey(b), id)
  for (const m of await store.smembers(monthsKey(id))) await store.del(xpKey(id, m))
  await store.del(monthsKey(id))
}

// ---- counting a deposit -------------------------------------------------------------------------------------

// Try to count one on-chain deposit toward the user's board XP. `tx` is the data object from getTransactionByHash,
// `hash` the transaction hash (used only to make the dedupe fingerprint; it is never stored). Returns a reason, and
// { counted, xp } when it counted. Every rule from the spec is checked here, so the tests can drive each case directly.
export async function countDeposit(store, u, hash, tx, now = Date.now()) {
  if (!onAnyBoard(u)) return { counted: false, reason: 'not_on_board' }
  if (!tx || tx.executionResult !== true) return { counted: false, reason: 'not_executed' }
  if (tx.to !== STAKING_CONTRACT) return { counted: false, reason: 'wrong_to' }
  if (!walletKeys(u).includes(walletKey(stripSpaces(tx.from)))) return { counted: false, reason: 'wrong_from' }
  const ts = txTimestampMs(tx)
  if (ts == null) return { counted: false, reason: 'no_timestamp' }
  const joined = joinedAtMs(u)
  if (joined == null || ts < joined) return { counted: false, reason: 'before_join' }
  if (monthOf(ts) !== monthOf(now)) return { counted: false, reason: 'not_this_month' }

  const month = monthOf(ts)
  const day = dayOf(ts)
  const rec = (await store.get(xpKey(u.id, month))) || { xp: 0, nim: 0, days: {} }
  if ((rec.days[day] || 0) >= DEPOSITS_PER_DAY) return { counted: false, reason: 'day_cap' }
  // Reserve the dedupe fingerprint only now, when the deposit is otherwise countable, so a day-capped tx is not burned.
  if (!(await store.setIfAbsent(seenKey(hash), 1, MONTH_SECONDS))) return { counted: false, reason: 'duplicate' }

  const value = Number(tx.value) / LUNA
  const before = rec.nim
  rec.nim = before + value
  rec.days[day] = (rec.days[day] || 0) + 1
  const steps = Math.max(0, Math.floor(rec.nim / 1000) - Math.floor(before / 1000))
  const add = XP_DEPOSIT + XP_THOUSAND * steps
  rec.xp += add
  await store.set(xpKey(u.id, month), rec)
  await store.expire(xpKey(u.id, month), MONTH_SECONDS)
  await store.sadd(monthsKey(u.id), month)
  await store.expire(monthsKey(u.id), MONTH_SECONDS)
  return { counted: true, reason: 'ok', xp: add }
}

// ---- reading a transaction from the chain -------------------------------------------------------------------
// A reported deposit is checked during its own request (POST /v1/me/xp/deposit), never queued in memory: a server
// restart can no longer lose it, and the phone keeps the hash until it gets a final answer (lib/boards.js). makeFetchTx
// returns getTx(hash) -> the transaction data object, or null (not found yet, or the RPC timed out / failed).

const DEFAULT_RPC = 'https://rpc.nimiqwatch.com'

export function makeFetchTx(rpcUrl) {
  const url = rpcUrl || process.env.NIMIQ_RPC_URL || DEFAULT_RPC
  return async (hash) => {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransactionByHash', params: [hash] }),
        signal: AbortSignal.timeout(10_000),
      })
      const out = await r.json()
      return out?.result?.data || null
    } catch { return null }
  }
}
