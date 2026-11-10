// Anonymous usage stats (Round 2E). Sent only by phones whose user tapped Share stats.
//
// Privacy rules (never break them):
// - No name, email, gift card code, PIN, link, order token or Nimiq address is accepted or stored.
// - The device's random id (anonId) is stored only as HMAC-SHA256(STATS_SALT, anonId).
// - Transaction hashes arrive with deposit and purchase events only so they can be checked once on the chain.
//   They wait in memory (never in storage) for at most 24 h; afterwards only { verified, nim | usd } is stored.
//   No endpoint ever returns a hash.
//
// Storage: Upstash Redis over its REST API when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set
// (list dibs:events, newest first, trimmed to 200,000). Otherwise an in-memory list mirrored to data/events.ndjson
// (reported as durable: false). Every stored event is also kept in memory, so the numbers are computed locally.
import { createHmac } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'

const MAX_EVENTS = 200_000
const LIST = 'dibs:events'
const FALLBACK_KEY = 'dibs:catalog_fallback' // hash day -> count of /api/catalog answers with live: false items
const DATA_DIR = new URL('../data/', import.meta.url)
const EVENTS_FILE = new URL('../data/events.ndjson', import.meta.url)
const FALLBACK_FILE = new URL('../data/catalog_fallback.json', import.meta.url)
const RPC_URL = process.env.NIMIQ_RPC_URL || 'https://rpc.nimiqwatch.com'
// Recipient of every add-stake transaction: the staking contract. Taken from the known add-stake tx
// f653ab2a5c8beb7f4a075aa1977729b0db26ff2bf5f70c793295527104772f64 (getTransactionByHash, field "to").
const STAKING_CONTRACT = 'NQ77 0000 0000 0000 0000 0000 0000 0000 0001'
const LUNA = 100_000
const DAY = 864e5
const HOUR = 36e5

const upstashUrl = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '')
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN || ''
export const durable = Boolean(upstashUrl && upstashToken)

// ---- storage ------------------------------------------------------------------------------------------------

const queue = [] // pending chain checks, in memory only (see the chain check section)
let events = [] // oldest first: { h, kind, at, data, backfill?, recv }
const raw = new WeakMap() // event -> the exact JSON string stored (Upstash LREM needs it)
let fallbackDays = {} // 'YYYY-MM-DD' -> count

async function redis(commands) {
  const r = await fetch(`${upstashUrl}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${upstashToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!r.ok) throw new Error(`Upstash HTTP ${r.status}`)
  const out = await r.json()
  const bad = out.find((x) => x.error)
  if (bad) throw new Error(`Upstash: ${bad.error}`)
  return out.map((x) => x.result)
}

function parse(line) {
  try { const e = JSON.parse(line); if (e && e.h && e.kind) { raw.set(e, line); return e } } catch { /* skip */ }
  return null
}

export const ready = (async () => {
  try {
    if (durable) {
      const [list, days] = await redis([['LRANGE', LIST, 0, -1], ['HGETALL', FALLBACK_KEY]])
      events = (list || []).map(parse).filter(Boolean).reverse()
      for (let i = 0; i + 1 < (days || []).length; i += 2) fallbackDays[days[i]] = Number(days[i + 1]) || 0
    } else {
      const text = await readFile(EVENTS_FILE, 'utf8').catch(() => '')
      events = text.split('\n').filter(Boolean).map(parse).filter(Boolean).slice(-MAX_EVENTS)
      fallbackDays = JSON.parse(await readFile(FALLBACK_FILE, 'utf8').catch(() => '{}')) || {}
    }
  } catch (e) {
    console.error('stats storage unreadable:', e.message)
  }
  rebuildIndex()
  console.log(`stats: ${events.length} events (${durable ? 'Upstash, durable' : 'local file, durable: false'})`)
})()

async function store(list) {
  if (!list.length) return
  const lines = list.map((e) => { const s = JSON.stringify(e); raw.set(e, s); return s })
  events.push(...list)
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS)
  for (const e of list) indexEvent(e)
  try {
    if (durable) await redis([['LPUSH', LIST, ...lines], ['LTRIM', LIST, 0, MAX_EVENTS - 1]])
    else {
      await mkdir(DATA_DIR, { recursive: true })
      await appendFile(EVENTS_FILE, lines.map((l) => l + '\n').join(''))
    }
  } catch (e) {
    console.error('stats write failed:', e.message)
  }
}

async function removeDevice(h) {
  const gone = events.filter((e) => e.h === h)
  if (!gone.length) return 0
  events = events.filter((e) => e.h !== h)
  rebuildIndex()
  invalidate()
  if (durable) {
    const cmds = gone.map((e) => ['LREM', LIST, 0, raw.get(e) || JSON.stringify(e)])
    for (let i = 0; i < cmds.length; i += 500) await redis(cmds.slice(i, i + 500))
  } else {
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(EVENTS_FILE, events.map((e) => (raw.get(e) || JSON.stringify(e)) + '\n').join(''))
  }
  return gone.length
}

// ---- dedupe index -----------------------------------------------------------------------------------------

let seen = new Set()
function dedupeKey(e) {
  const d = e.data || {}
  switch (e.kind) {
    case 'app_open': return `${e.h}|open|${String(e.at).slice(0, 10)}`
    case 'snapshot': return `${e.h}|snap|${String(e.at).slice(0, 10)}`
    case 'goal_created': return `${e.h}|goal|${d.goalId}`
    case 'goal_deleted': return `${e.h}|del|${d.goalId}`
    case 'deposit': return `${e.h}|dep|${d.depositId}` // by the app's deposit id, never by hash
    case 'purchase': return `${e.h}|buy|${d.goalId}` // by goal, never by hash
    case 'unlock_step': return `${e.h}|unl|${d.goalId}|${d.step}`
    default: return null
  }
}
function indexEvent(e) { const k = dedupeKey(e); if (k) seen.add(k) }
function rebuildIndex() { seen = new Set(); for (const e of events) indexEvent(e); for (const p of queue) seen.add(p.key) }

// ---- validation -------------------------------------------------------------------------------------------

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(clamp(v, lo, hi) * 1e5) / 1e5 : null)
const id = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null)
const slug = (v) => (typeof v === 'string' && /^[a-z0-9_.-]{1,48}$/i.test(v) ? v : null)
const oneOf = (list) => (v) => (list.includes(v) ? v : null)
const hex64 = (v) => (typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v) ? v.toLowerCase() : null)
const nim = (v) => num(v, 0, 10_000_000)
const usd = (v) => num(v, 0, 2_000)

// Earned from staking: only snapshots made with the app's honest rule (earnedRule 2: rewards on the principal Dibs
// tracks, inGoalsNim) count. Earlier phones sent "total staked minus goal deposits", which called stake from outside
// Dibs "earned" (24,263 NIM for 47,797 saved): every earnedNim without the rule is ignored.
// Sanity check, the app's own bound (app/src/lib/profileStats.js MAX_APR): earned <= inGoalsNim x 25 % x
// earnedDays / 365 + 1 NIM (the same 1 NIM allowance the app gives stake noise). Above it, the report is dropped.
export const EARNED_RULE = 2
const MAX_APR = 0.25
const EARNED_FLOOR = 1
export const maxEarned = (inGoalsNim, days) => inGoalsNim * MAX_APR * (days / 365) + EARNED_FLOOR
export function reliableEarned(d) {
  if (!d || d.earnedRule !== EARNED_RULE) return null
  if (![d.earnedNim, d.inGoalsNim, d.earnedDays].every((v) => typeof v === 'number')) return null
  if (d.earnedNim > 0 && !(d.inGoalsNim > 0)) return null
  if (d.earnedNim > maxEarned(d.inGoalsNim, d.earnedDays)) return null
  return d.earnedNim
}

// Allowed kinds and their fields. Anything else is dropped. A null for a required field drops the event.
const KINDS = {
  app_open: { lang: oneOf(['en', 'fr', 'es']) },
  snapshot: { stakedNim: nim, earnedNim: nim, inGoalsNim: nim, earnedDays: (v) => num(v, 0, 3650), earnedRule: oneOf([EARNED_RULE]), goalsActive: (v) => num(v, 0, 1000) },
  consent: { value: oneOf(['yes']) },
  goal_created: { goalId: id, brand: slug, itemId: id, usd, weeks: (v) => num(v, 0, 60) },
  deposit: { goalId: id, depositId: id, nim, tx: hex64 },
  move: { nim },
  goal_deleted: { goalId: id },
  unlock_step: { goalId: id, step: oneOf(['deactivate', 'retire', 'remove']), mode: oneOf(['card', 'withdraw']) },
  purchase: { goalId: id, itemId: id, usd, tx: hex64 },
  error: { key: (v) => (typeof v === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(v) ? v : null) },
}
// Fields that may be missing (the event is kept without them).
const OPTIONAL = { snapshot: ['earnedNim', 'inGoalsNim', 'earnedDays', 'earnedRule'], goal_created: ['brand', 'itemId', 'usd', 'weeks'], deposit: ['tx'], purchase: ['itemId', 'usd', 'tx'], app_open: ['lang'] }

function clean(ev, now) {
  if (!ev || typeof ev !== 'object') return null
  const spec = KINDS[ev.kind]
  if (!spec) return null
  const at = Date.parse(ev.at)
  const backfill = ev.backfill === true
  if (!Number.isFinite(at) || at > now + 5 * 60_000 || at < now - (backfill ? 60 : 30) * DAY) return null
  const src = ev.data && typeof ev.data === 'object' ? ev.data : {}
  const data = {}
  for (const [k, check] of Object.entries(spec)) {
    const v = check(src[k])
    if (v === null) { if ((OPTIONAL[ev.kind] || []).includes(k)) continue; return null }
    data[k] = v
  }
  return { kind: ev.kind, at: new Date(at).toISOString(), data, ...(backfill ? { backfill: true } : {}) }
}

// ---- intake -----------------------------------------------------------------------------------------------

const salt = () => process.env.STATS_SALT || ''
let saltWarned = false
export function statsEnabled() {
  if (salt()) return true
  if (!saltWarned) { saltWarned = true; console.error('STATS_SALT is not set: /api/events answers 503') }
  return false
}
const deviceHash = (anonId) => createHmac('sha256', salt()).update(anonId).digest('hex')
const validAnon = (v) => typeof v === 'string' && /^[0-9a-f-]{16,64}$/i.test(v)

const perDevice = new Map() // hash -> [times]
function deviceAllowance(h, n) {
  const now = Date.now()
  const recent = (perDevice.get(h) || []).filter((t) => now - t < HOUR)
  const room = Math.max(0, 60 - recent.length)
  const take = Math.min(room, n)
  for (let i = 0; i < take; i++) recent.push(now)
  perDevice.set(h, recent)
  return take
}

// Returns 'ok' | 'bad' | 'limited'.
export async function intake(body) {
  await ready
  const { anonId, events: list } = body || {}
  if (!validAnon(anonId) || !Array.isArray(list) || list.length > 20) return 'bad'
  const h = deviceHash(anonId)
  const now = Date.now()
  const valid = list.map((e) => clean(e, now)).filter(Boolean)
  if (!valid.length) return 'ok'
  const take = deviceAllowance(h, valid.length)
  if (take === 0) return 'limited'
  const toStore = []
  for (const e of valid.slice(0, take)) {
    const ev = { h, ...e, recv: new Date(now).toISOString() }
    const key = dedupeKey(ev)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    if (ev.kind === 'deposit' || ev.kind === 'purchase') { enqueue(ev, key); continue }
    toStore.push(ev)
  }
  await store(toStore)
  return take < valid.length ? 'limited' : 'ok'
}

export async function forget(body) {
  await ready
  const { anonId } = body || {}
  if (!validAnon(anonId)) return false
  const h = deviceHash(anonId)
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].ev.h === h) queue.splice(i, 1)
  perDevice.delete(h)
  await removeDevice(h)
  return true
}

// ---- chain check ------------------------------------------------------------------------------------------
// In memory only: { ev, tx, key, first, next, tries }. Two RPC calls per second at most.

const MAX_QUEUE = 5000

function enqueue(ev, key) {
  const { tx, ...data } = ev.data
  const item = { ev: { ...ev, data }, tx: tx || null, key, first: Date.now(), next: Date.now(), tries: 0 }
  if (!item.tx) { finish(item, false); return }
  if (queue.length >= MAX_QUEUE) { finish(item, false); return }
  queue.push(item)
}

// After the check the hash is gone: only { verified, nim | usd } and the event's ids stay.
function finish(item, verified) {
  item.tx = null
  const i = queue.indexOf(item)
  if (i >= 0) queue.splice(i, 1)
  store([{ ...item.ev, data: { ...item.ev.data, verified } }])
}

async function rpc(method, params) {
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  })
  return r.json()
}

async function checkOne(item) {
  item.tries += 1
  let res
  try { res = await rpc('getTransactionByHash', [item.tx]) } catch { res = null }
  const tx = res?.result?.data
  if (tx) {
    let ok = tx.executionResult === true
    if (ok && item.ev.kind === 'deposit') {
      ok = Math.abs(Number(tx.value) / LUNA - item.ev.data.nim) <= 1 && tx.to === STAKING_CONTRACT
    }
    finish(item, ok)
    return
  }
  // Not found yet, or the RPC could not be read: try again later, give up (unverified) after 24 h.
  if (Date.now() - item.first > DAY) { finish(item, false); return }
  item.next = Date.now() + Math.min(60 * 60_000, 60_000 * 2 ** Math.min(item.tries - 1, 6))
}

let busy = false
setInterval(async () => {
  if (busy) return
  const item = queue.find((q) => q.next <= Date.now())
  if (!item) return
  busy = true
  item.next = Infinity // not picked twice
  try { await checkOne(item) } finally { busy = false }
}, 500).unref()

// ---- catalogue fallback counter ---------------------------------------------------------------------------

export function countCatalogFallback() {
  const day = new Date().toISOString().slice(0, 10)
  fallbackDays[day] = (fallbackDays[day] || 0) + 1
  const write = durable
    ? redis([['HINCRBY', FALLBACK_KEY, day, 1]])
    : mkdir(DATA_DIR, { recursive: true }).then(() => writeFile(FALLBACK_FILE, JSON.stringify(fallbackDays)))
  write.catch((e) => console.error('catalog counter write failed:', e.message))
}

// ---- numbers ----------------------------------------------------------------------------------------------

// Public numbers are cached 60 s; a deletion clears the cache so the totals go down at once.
let cache = null
function invalidate() { cache = null }

const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d

function compute() {
  const devices = new Set()
  const savers = new Set()
  const goals = new Map() // `${h}|${goalId}` -> { brand, weeks, at }
  const ended = new Set() // deleted, bought or withdrawn
  const reached = new Set()
  const firstDeposit = new Map() // goal key -> earliest verified deposit time
  const bought = new Set()
  const snapshots = new Map() // h -> latest snapshot
  const earnedBy = new Map() // h -> latest snapshot with a reliable earned figure (see reliableEarned)
  let nimAdded = 0, cardsBought = 0, cardsUsd = 0
  const verifiedDeposits = []
  let unverified = 0
  const unlock = { card: { deactivate: 0, retire: 0, remove: 0 }, withdraw: { deactivate: 0, retire: 0, remove: 0 } }
  let withdrawals = 0, moves = 0, movedNim = 0, deletions = 0
  const errors = {}
  const perDay = {}
  let since = null

  for (const e of events) {
    devices.add(e.h)
    if (!since || e.at < since) since = e.at
    const d = e.data || {}
    const gk = d.goalId ? `${e.h}|${d.goalId}` : null
    const day = e.at.slice(0, 10)
    perDay[day] = (perDay[day] || 0) + 1
    switch (e.kind) {
      case 'goal_created': goals.set(gk, { brand: d.brand || 'other', weeks: d.weeks ?? null, at: e.at }); break
      case 'deposit':
        if (d.verified) {
          savers.add(e.h); nimAdded += d.nim; verifiedDeposits.push(d.nim)
          if (!firstDeposit.has(gk) || e.at < firstDeposit.get(gk)) firstDeposit.set(gk, e.at)
        } else unverified += 1
        break
      case 'purchase':
        reached.add(gk); ended.add(gk)
        if (d.verified) { cardsBought += 1; cardsUsd += d.usd || 0; bought.add(gk) }
        break
      case 'unlock_step':
        unlock[d.mode][d.step] += 1
        if (d.mode === 'card') reached.add(gk)
        if (d.mode === 'withdraw' && d.step === 'remove') { withdrawals += 1; ended.add(gk) }
        break
      case 'goal_deleted': deletions += 1; ended.add(gk); break
      case 'move': moves += 1; movedNim += d.nim; break
      case 'error': errors[d.key] = (errors[d.key] || 0) + 1; break
      case 'snapshot': {
        const s = snapshots.get(e.h); if (!s || e.at >= s.at) snapshots.set(e.h, { at: e.at, ...d })
        const n = reliableEarned(d)
        const r = earnedBy.get(e.h); if (n != null && (!r || e.at >= r.at)) earnedBy.set(e.h, { at: e.at, n })
        break
      }
      default: break
    }
  }
  unverified += queue.length ? queue.filter((q) => q.ev.kind === 'deposit').length : 0

  let staked = 0, earned = 0
  for (const s of snapshots.values()) staked += s.stakedNim || 0
  for (const r of earnedBy.values()) earned += r.n
  const created = [...goals.keys()]
  const pub = {
    since,
    updatedAt: new Date().toISOString(),
    durable,
    people: devices.size,
    savers: savers.size,
    goalsCreated: goals.size,
    goalsActive: created.filter((k) => !ended.has(k)).length,
    goalsReached: created.filter((k) => reached.has(k)).length,
    cardsBought,
    cardsUsd: round(cardsUsd, 2),
    nimAddedVerified: round(nimAdded, 2),
    nimStakedNow: round(staked, 2),
    nimEarned: earnedBy.size ? round(earned, 5) : null, // null: no reliable report yet, the page says so
    earnedReports: earnedBy.size,
  }

  const brands = {}
  const weeks = {}
  const daysToFirst = []
  for (const [k, g] of goals) {
    const b = (brands[g.brand] ||= { created: 0, firstDeposit: 0, reached: 0, bought: 0 })
    b.created += 1
    if (firstDeposit.has(k)) { b.firstDeposit += 1; daysToFirst.push((Date.parse(firstDeposit.get(k)) - Date.parse(g.at)) / DAY) }
    if (reached.has(k)) b.reached += 1
    if (bought.has(k)) b.bought += 1
    const w = g.weeks == null ? 'unknown' : String(g.weeks)
    weeks[w] = (weeks[w] || 0) + 1
  }
  const last14 = []
  for (let i = 13; i >= 0; i--) { const day = new Date(Date.now() - i * DAY).toISOString().slice(0, 10); last14.push({ day, events: perDay[day] || 0, catalogFallback: fallbackDays[day] || 0 }) }
  const admin = {
    ...pub,
    brands,
    weeksPresets: weeks,
    medianDepositNim: median(verifiedDeposits),
    medianDaysToFirstDeposit: daysToFirst.length ? round(median(daysToFirst), 1) : null,
    unverifiedDeposits: unverified,
    pendingChecks: queue.length,
    unlockSteps: unlock,
    withdrawals,
    moves: { count: moves, nim: round(movedNim, 2) },
    deletions,
    errors,
    days: last14,
    storedEvents: events.length,
  }
  return { pub, admin }
}

export async function publicStats() {
  await ready
  if (cache && Date.now() - cache.at < 60_000) return cache.pub
  cache = { at: Date.now(), pub: compute().pub }
  return cache.pub
}

export async function adminStats() {
  await ready
  return compute().admin
}
