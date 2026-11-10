// Anonymous usage stats (Round 2E). Consent first: nothing is sent until the user taps Share stats.
//
// Never sent: a name, an email, a gift card code, PIN or link, an order token, a Nimiq address.
// The phone makes a random id (dibs.anonId); the server stores only a keyed hash of it.
// Transaction hashes go with deposit and purchase events only, so the server can check them once on the chain.
// Sending never blocks the app: fire and forget, 4 s timeout, errors swallowed, at most 50 unsent events kept.
import { config } from './config.js'
import { txHash } from './history.js'

const CONSENT = 'dibs.stats' // 'yes' | 'no' | absent (not asked yet)
const ANON = 'dibs.anonId'
const OUTBOX = 'dibs.outbox'
const DAILY = 'dibs.stats.daily' // { open: 'YYYY-MM-DD', snapshot: 'YYYY-MM-DD' }
const BACKFILLED = 'dibs.stats.backfilled'
const MAX_OUTBOX = 50
const BATCH = 20
const DAY_MS = 864e5

const get = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const set = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const del = (k) => { try { localStorage.removeItem(k) } catch { /* ignore */ } }
const readJson = (k, fallback) => { try { return JSON.parse(get(k)) ?? fallback } catch { return fallback } }

// Demo mode (a desktop browser, outside Nimiq Pay) counts nobody in production: only dev builds send from it.
let demo = false
export const configureStats = (opts) => { demo = Boolean(opts?.demo) }
const canSend = () => !demo || Boolean(import.meta.env?.DEV)

export const consent = () => { const v = get(CONSENT); return v === 'yes' || v === 'no' ? v : null }
const anonId = () => {
  let id = get(ANON)
  if (!id) { id = crypto.randomUUID(); set(ANON, id) }
  return id
}

const outbox = () => { const l = readJson(OUTBOX, []); return Array.isArray(l) ? l : [] }
// Each queued event carries a local id (i) so a sent batch can be removed; the server ignores it.
const localId = () => Math.random().toString(36).slice(2, 10)
const queue = (events) => saveOutbox([...outbox(), ...events.map((e) => ({ i: localId(), ...e }))])
const saveOutbox = (l) => (l.length ? set(OUTBOX, JSON.stringify(l.slice(-MAX_OUTBOX))) : del(OUTBOX))

// One line at each call site, after the action has succeeded. Does nothing without consent.
export function track(kind, data = {}) {
  if (consent() !== 'yes') return
  try {
    queue([{ kind, at: new Date().toISOString(), data }])
    flush()
  } catch { /* never let stats break the app */ }
}

async function post(method, body) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 4000)
  try {
    return await fetch(`${config.apiUrl}/api/events`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal, keepalive: method === 'POST' })
  } finally { clearTimeout(timer) }
}

let flushing = false
export async function flush() {
  if (flushing || consent() !== 'yes' || !canSend()) return
  flushing = true
  try {
    for (let round = 0; round < 3; round++) {
      const list = outbox()
      if (!list.length) break
      const batch = list.slice(0, BATCH)
      const r = await post('POST', { anonId: anonId(), events: batch })
      // 2xx: sent. 400: the server will never take this batch, drop it. Anything else: keep it for the next open.
      if (!(r.ok || r.status === 400)) break
      const sent = new Set(batch.map((e) => e.i))
      saveOutbox(outbox().filter((e) => !sent.has(e.i)))
    }
  } catch { /* offline or server down: the outbox waits */ } finally { flushing = false }
}

// Once a day: app_open, and the Stake tab's own numbers (stakedNim, earnedNim, goalsActive).
// The snapshot payload from stakeSummary() (lib/earned.js), the one earned calculation in the app. Pure.
// earnedRule 2 = only rewards on the principal Dibs tracks (inGoalsNim). The server counts earnedNim only with it.
// earned unknown (null): no earnedNim at all, never 0 or a guess.
export const EARNED_RULE = 2
// earnedDays: days since Dibs started measuring (summary.since), so the server can check earned against
// 25 % a year of inGoalsNim, the app's own bound (profileStats.MAX_APR).
export function snapshotData(summary, goalsActive, now = Date.now()) {
  const { total, inGoals, earned, since } = summary || {}
  const out = { stakedNim: total ?? 0, goalsActive }
  if (earned == null || !Number.isFinite(earned)) return out
  const from = Date.parse(since)
  const earnedDays = Number.isFinite(from) ? Math.max(0, Math.round(((now - from) / DAY_MS) * 100) / 100) : 0
  return { ...out, earnedNim: earned, inGoalsNim: inGoals ?? 0, earnedDays, earnedRule: EARNED_RULE }
}
const today = () => new Date().toISOString().slice(0, 10)
export function dailyDue(kind) {
  if (consent() !== 'yes') return false
  return readJson(DAILY, {})[kind] !== today()
}
export function markDaily(kind) { set(DAILY, JSON.stringify({ ...readJson(DAILY, {}), [kind]: today() })) }

// What the phone already has, as backfill events with their original dates. Pure.
export function backfillEvents(goals, now = Date.now()) {
  const out = []
  const weeksOf = (g) => {
    const ms = Date.parse(g.deadline) - Date.parse(g.createdAt)
    return Number.isFinite(ms) ? Math.max(1, Math.round(ms / (7 * DAY_MS))) : undefined
  }
  const add = (kind, at, data) => { if (at && Date.parse(at) > now - 60 * DAY_MS) out.push({ kind, at: new Date(at).toISOString(), data, backfill: true }) }
  for (const g of goals || []) {
    if (!g?.id) continue
    add('goal_created', g.createdAt, { goalId: g.id, brand: g.brandKey || undefined, itemId: g.itemId, usd: g.usd, weeks: weeksOf(g) })
    for (const d of g.deposits || []) {
      if (d.kind || !d.id || !(d.nim > 0)) continue // moves and returns are not deposits
      add('deposit', d.at, { goalId: g.id, depositId: d.id, nim: d.nim, tx: txHash(d.tx) || undefined })
    }
    const mode = g.unlockMode === 'withdraw' ? 'withdraw' : 'card'
    for (const s of g.unlockSteps || []) add('unlock_step', s.at, { goalId: g.id, step: s.step, mode })
    if (g.status === 'redeemed' && g.payment) add('purchase', g.payment.at, { goalId: g.id, itemId: g.itemId, usd: g.usd, tx: txHash(g.payment.hash) || undefined })
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))
}

// Every goal on this device, whatever address it was saved under (onboarding runs before the wallet is known).
function deviceGoals() {
  const byId = new Map()
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('dibs.goals.')) continue
      for (const g of readJson(k, [])) if (g?.id && !byId.has(g.id)) byId.set(g.id, g)
    }
  } catch { /* storage blocked */ }
  return [...byId.values()]
}

// The user's answer. 'yes' the first time also replays what the phone already has (once).
export function setConsent(value, goals = deviceGoals()) {
  if (value !== 'yes') { set(CONSENT, 'no'); del(OUTBOX); return }
  set(CONSENT, 'yes')
  anonId()
  track('consent', { value: 'yes' })
  if (!get(BACKFILLED)) {
    set(BACKFILLED, '1')
    queue(backfillEvents(goals))
  }
  flush()
}

// Settings > Delete what was shared. Removes this phone's events on the server, then forgets the id and says no.
// Returns true when the server confirmed (or when nothing was ever shared from this phone).
export async function deleteShared() {
  const id = get(ANON)
  if (id) {
    try {
      const r = await post('DELETE', { anonId: id })
      if (!r.ok) return false
    } catch { return false }
  }
  del(ANON); del(OUTBOX); del(BACKFILLED); del(DAILY)
  set(CONSENT, 'no')
  return true
}

// More > Dibs in numbers. null when the server cannot be reached.
export async function publicNumbers() {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 4000)
  try {
    const r = await fetch(`${config.apiUrl}/api/stats`, { signal: ctl.signal })
    return r.ok ? await r.json() : null
  } catch { return null } finally { clearTimeout(timer) }
}
export const numbersPageUrl = () => `${config.apiUrl}/stats`
