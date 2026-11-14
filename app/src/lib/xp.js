// XP, levels, ranks and the weekly rhythm. Worked out on the phone from data the app already has (goal ledger,
// dibs.badges, visits, quests, shares). Nothing here is sent anywhere and nothing here pays NIM.
// Weeks run Monday to Sunday in the phone's local time; days are local 'YYYY-MM-DD'.

const DAY = 864e5
const pad = (n) => String(n).padStart(2, '0')

export const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const dayStart = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
// Monday 00:00 local of the week holding ms.
export function weekStart(ms) {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
}
export const weekKey = (ms) => dayKey(weekStart(ms))
const nextWeek = (start) => { const d = new Date(start); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime() }
// ISO 8601 week number (1..53).
export function isoWeek(ms) {
  const d = new Date(ms)
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7)
}

// Device storage (like dibs.badges). Every read and write is guarded.
const read = (k, fallback) => { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v) } catch { return fallback } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage blocked */ } }
export const XP_EVENT = 'dibs:xp'
export const fireXp = () => { try { window.dispatchEvent(new Event(XP_EVENT)) } catch { /* no window */ } }

export const getVisits = () => { const v = read('dibs.visits', []); return Array.isArray(v) ? v : [] }
// Adds today to dibs.visits (sorted, last 400 days).
export function recordVisit(now = Date.now()) {
  const day = dayKey(now)
  const visits = getVisits()
  if (visits.includes(day)) return visits
  const next = [...visits, day].sort().slice(-400)
  write('dibs.visits', next)
  fireXp()
  return next
}
export const getQuestsDone = () => { const v = read('dibs.quests.done', []); return Array.isArray(v) ? v : [] }
export function addQuestDone(entry) { write('dibs.quests.done', [...getQuestsDone(), entry]); fireXp() }
// Daily quests (lib/quests.js): one compact record per local day, { xp, quests, full, add }. xp = the day's daily XP
// (real quests + the all-done bonus; never the daily-visit 5, which stays in dibs.visits). quests = real quests done
// that day (not the check-in); full = every slot done; add = an Add NIM slot was offered. Bounded like dibs.visits.
export const getDailyDays = () => { const v = read('dibs.daily.days', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {} }
export function recordDailyDay(day, rec) {
  const days = getDailyDays()
  days[day] = rec
  const keys = Object.keys(days).sort()
  write('dibs.daily.days', keys.length > 400 ? Object.fromEntries(keys.slice(-400).map((k) => [k, days[k]])) : days)
  fireXp()
}
// Badges shared at least once: [{ id, at }], the first share of each id only.
export const getSharedIds = () => { const v = read('dibs.badges.sharedIds', []); return Array.isArray(v) ? v : [] }
export function addSharedId(id, now = Date.now()) {
  const list = getSharedIds()
  if (list.some((x) => x.id === id)) return
  write('dibs.badges.sharedIds', [...list, { id, at: new Date(now).toISOString() }])
  fireXp()
}

export const XP = { open: 5, deposit: 10, thousand: 5, milestone: 25, badge: 50, share: 30, quest: 40, card: 200, daily: 5 }
const DEPOSITS_PER_DAY = 3
const realDeposit = (d) => d.nim > 0 && d.kind !== 'move' && d.kind !== 'withdraw'
const ms = (v) => { const n = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(n) ? n : null }
const byAt = (a, b) => (ms(a.at) ?? 0) - (ms(b.at) ?? 0)

// Every XP event: [{ at (ms), xp, kind }].
export function xpEvents({ goals = [], badges = {}, sharedIds = [], visits = [], questsDone = [], dailyDays = {} }) {
  const out = []
  const add = (at, xp, kind) => { if (at != null && xp > 0) out.push({ at, xp, kind }) }
  for (const day of visits) add(dayStart(day), XP.open, 'open')

  const real = goals.flatMap((g) => (g.deposits || []).filter(realDeposit)).filter((d) => ms(d.at) != null).sort(byAt)
  const perDay = {}
  let total = 0
  for (const d of real) {
    const at = ms(d.at)
    const day = dayKey(at)
    perDay[day] = (perDay[day] || 0) + 1
    if (perDay[day] <= DEPOSITS_PER_DAY) add(at, XP.deposit, 'deposit')
    const before = total
    total += d.nim
    const steps = Math.floor(total / 1000) - Math.floor(before / 1000)
    if (steps > 0) add(at, XP.thousand * steps, 'thousand')
  }

  for (const g of goals) {
    if (!(g.targetNim > 0)) continue
    let saved = 0
    const reached = new Set()
    for (const d of (g.deposits || []).filter((x) => ms(x.at) != null).sort(byAt)) {
      saved += d.nim
      for (const p of [25, 50, 75]) {
        if (!reached.has(p) && saved >= (p / 100) * g.targetNim) { reached.add(p); add(ms(d.at), XP.milestone, 'milestone') }
      }
    }
  }

  for (const rec of Object.values(badges || {})) add(ms(rec?.at), XP.badge, 'badge')
  for (const s of sharedIds) add(ms(s.at), XP.share, 'share')
  for (const q of questsDone) add(ms(q.at), q.id === 'days5' ? 30 : XP.quest, 'quest')
  for (const [day, rec] of Object.entries(dailyDays || {})) if (rec && rec.xp > 0) add(dayStart(day), rec.xp, 'daily')
  for (const g of goals) if (g.status === 'redeemed') add(ms(g.payment?.at) ?? ms(g.createdAt), XP.card, 'card')
  return out.sort((a, b) => a.at - b.at)
}

// The rhythm level in force during each week ({ weekKey: level }), from the week of the first visit to the week of
// `until`. A week with a visit raises the level by one (max 5) for the weeks after it; a week without lowers it by one.
export function weekLevels(visits = [], until = Date.now()) {
  const levels = {}
  if (!visits.length) return levels
  const seen = new Set(visits.map((d) => weekKey(dayStart(d))))
  const last = weekStart(until)
  let level = 0
  for (let w = weekStart(dayStart(visits[0])); w <= last; w = nextWeek(w)) {
    const key = dayKey(w)
    levels[key] = level
    level = seen.has(key) ? Math.min(level + 1, 5) : Math.max(level - 1, 0)
  }
  return levels
}

// { level 0..5 (this week's bonus), weeks (weeks in a row with a visit, up to this week) }.
export function rhythm(visits = [], now = Date.now()) {
  const level = weekLevels(visits, now)[weekKey(now)] || 0
  const seen = new Set(visits.map((d) => weekKey(dayStart(d))))
  let w = weekStart(now)
  if (!seen.has(dayKey(w))) w = weekStart(w - DAY) // this week not opened yet: count up to last week
  let weeks = 0
  while (seen.has(dayKey(w))) { weeks += 1; w = weekStart(w - DAY) }
  return { level, weeks }
}

// Each week's XP = floor(sum x (1 + 0.1 x that week's rhythm level)); the weeks added up.
export function totalXp(events = [], visits = [], now = Date.now()) {
  const until = Math.max(now, ...events.map((e) => e.at))
  const levels = weekLevels(visits, until)
  const sums = {}
  for (const e of events) { const k = weekKey(e.at); sums[k] = (sums[k] || 0) + e.xp }
  return Object.entries(sums).reduce((s, [k, sum]) => s + Math.floor(sum * (1 + 0.1 * (levels[k] || 0)) + 1e-9), 0)
}

// The XP shown: never below the highest total shown before (dibs.xp.best). XP and rank never go down.
export function shownXp(total) {
  const best = Number(read('dibs.xp.best', 0)) || 0
  if (total > best) { write('dibs.xp.best', total); return total }
  return best
}

// Level 1 at 0 XP; level n -> n + 1 needs 100 + 50 x (n - 1) XP. No cap.
export function levelOf(xp) {
  let level = 1
  let into = Math.max(0, Math.floor(xp))
  let need = 100
  while (into >= need) { into -= need; level += 1; need = 100 + 50 * (level - 1) }
  return { level, into, need }
}

export const RANKS = [
  { id: 'starter', level: 1 }, { id: 'saver', level: 5 }, { id: 'planner', level: 10 },
  { id: 'collector', level: 20 }, { id: 'treasurer', level: 35 }, { id: 'legend', level: 50 },
]
export const rankOf = (level) => RANKS.filter((r) => r.level <= level).at(-1) || RANKS[0]
export const nextRank = (level) => RANKS.find((r) => r.level > level) || null

// Everything a screen needs, from storage and the given goals and badges.
export function xpSummary({ goals = [], badges = {}, now = Date.now() }) {
  const visits = getVisits()
  const events = xpEvents({ goals, badges, sharedIds: getSharedIds(), visits, questsDone: getQuestsDone(), dailyDays: getDailyDays() })
  const xp = shownXp(totalXp(events, visits, now))
  const lv = levelOf(xp)
  return { xp, ...lv, rank: rankOf(lv.level), next: nextRank(lv.level), rhythm: rhythm(visits, now) }
}
