// Quest of the week: one optional quest per week (Monday to Sunday, local time), picked the first time the app checks
// during that week and kept in dibs.quest so it never changes mid-week. Nothing is lost when it is not done.
// Done quests give XP (lib/xp.js); nothing here pays NIM or leaves the phone.
import { savedNim } from './goals.js'
import { planOf } from './pace.js'
import { CHIPS } from './brands.js'
import { chipOf } from './badges.js'
import { addQuestDone, dayKey, dayStart, fireXp, getDailyDays, getQuestsDone, getVisits, isoWeek, recordDailyDay, weekKey, weekStart } from './xp.js'
import { MIN_NEW_STAKER_NIM } from './config.js'

export const KINDS = ['round', 'week', 'new', 'two', 'days5']
const realDeposit = (d) => d.nim > 0 && d.kind !== 'move' && d.kind !== 'withdraw'
const savingUnder100 = (g) => g.status === 'saving' && g.targetNim > 0 && savedNim(g) < g.targetNim

// Round it up: the saving goal that needs the least NIM to reach its next 10 % step.
function pickRound(goals) {
  const neverDeposited = !goals.some((g) => (g.deposits || []).some(realDeposit))
  let best = null
  for (const g of goals.filter(savingUnder100)) {
    const saved = savedNim(g)
    const pct = saved / g.targetNim
    const to = Math.min(100, (Math.floor(pct * 10 + 1e-9) + 1) * 10)
    const need = Math.ceil((to / 100) * g.targetNim - saved)
    if (!best || need < best.need) best = { g, saved, from: Math.floor(pct * 100), to, need }
  }
  if (!best) return null
  const amount = neverDeposited ? Math.max(best.need, MIN_NEW_STAKER_NIM) : best.need
  return { id: 'round', goalId: best.g.id, from: best.from, to: best.to, amount, base: best.saved }
}

// This week's amount: the saving goal furthest behind (same choice as WeekCard's Add button), its amount this week.
function pickWeek(goals, now) {
  const first = goals.filter(savingUnder100)
    .map((g) => ({ g, plan: planOf(g, now) }))
    .filter((x) => x.plan.pace.kind !== 'ahead' && x.plan.pace.kind !== 'done' && x.plan.pace.amount > 0)
    .sort((a, b) => b.plan.lagWeeks - a.plan.lagWeeks || (b.plan.pace.amount || 0) - (a.plan.pace.amount || 0))[0]
  return first ? { id: 'week', goalId: first.g.id, amount: Math.ceil(first.plan.pace.amount) } : null
}

// New territory: the first category (catalogue order) with no goal ever.
function pickNew(goals) {
  const used = new Set(goals.map(chipOf))
  const chip = CHIPS.find((c) => !used.has(c))
  return chip ? { id: 'new', chip } : null
}

// Two goals: add to two different saving goals under 100 % this week. Applies with at least two such goals.
function pickTwo(goals) {
  return goals.filter(savingUnder100).length >= 2 ? { id: 'two' } : null
}

// Five days: open Dibs on five different days this week. Applies once the user has an active goal.
function pickDays5(goals) {
  return goals.some(activeGoal) ? { id: 'days5' } : null
}

// The kinds that apply, in the order round, week, new; index = ISO week number mod count. null: no quest this week.
// No goal at all (any status): no quest yet, nothing stored; the first check after the first goal picks the week's.
// pickedAt: New territory only counts a goal created after it.
export function pickQuest(goals = [], now = Date.now()) {
  if (!goals.length) return null
  const options = [pickRound(goals), pickWeek(goals, now), pickNew(goals), pickTwo(goals), pickDays5(goals)].filter(Boolean)
  if (!options.length) return null
  return { week: weekKey(now), pickedAt: new Date(now).toISOString(), ...options[isoWeek(now) % options.length] }
}

const goneGoal = (goal) => !goal || goal.status === 'redeemed' || goal.status === 'withdrawn'

// { done, progress 0..1, hidden }. hidden: the quest's goal was deleted, bought or withdrawn (the card goes away).
export function questState(quest, goals = [], now = Date.now()) {
  if (!quest) return { done: false, progress: 0, hidden: true }
  const from = weekStart(now)
  if (quest.id === 'new') {
    // Only a goal created after the quest was picked (quests stored before pickedAt existed: the week's start).
    const after = Date.parse(quest.pickedAt) || from
    const done = goals.some((g) => chipOf(g) === quest.chip && Date.parse(g.createdAt) > after)
    return { done, progress: done ? 1 : 0, hidden: false }
  }
  if (quest.id === 'two') {
    // Two different goals each with a real deposit this week.
    const n = goals.filter((g) => (g.deposits || []).some((d) => realDeposit(d) && Date.parse(d.at) >= from)).length
    return { done: n >= 2, progress: Math.min(1, n / 2), count: Math.min(2, n), hidden: false }
  }
  if (quest.id === 'days5') {
    // Visit days this week (dibs.visits), five needed.
    const wk = weekKey(now)
    const n = getVisits().filter((d) => weekKey(dayStart(d)) === wk).length
    return { done: n >= 5, progress: Math.min(1, n / 5), count: Math.min(5, n), hidden: false }
  }
  const goal = goals.find((g) => g.id === quest.goalId)
  if (goneGoal(goal)) return { done: false, progress: 0, hidden: true }
  if (quest.id === 'round') {
    const target = (quest.to / 100) * goal.targetNim
    const saved = savedNim(goal)
    const base = Math.min(quest.base ?? 0, target)
    const done = saved >= target - 1e-9
    return { done, progress: done ? 1 : Math.max(0, Math.min(1, (saved - base) / (target - base || 1))), hidden: false }
  }
  const added = (goal.deposits || []).filter((d) => realDeposit(d) && Date.parse(d.at) >= from).reduce((s, d) => s + d.nim, 0)
  const done = added >= quest.amount
  return { done, progress: Math.min(1, added / (quest.amount || 1)), hidden: false }
}

const read = () => { try { return JSON.parse(localStorage.getItem('dibs.quest')) || null } catch { return null } }
const write = (q) => { try { localStorage.setItem('dibs.quest', JSON.stringify(q)) } catch { /* storage blocked */ } }

// This week's quest (stored), picked now if the week changed. null: none applies this week.
export function currentQuest(goals = [], now = Date.now()) {
  const stored = read()
  if (stored && stored.week === weekKey(now)) return stored
  const q = pickQuest(goals, now)
  if (q) write(q)
  return q
}

// The quest, its state, whether it was done earlier this week, and justDone the first time it is found done
// (recorded in dibs.quests.done, which fires dibs:xp).
export function checkQuest(goals = [], now = Date.now()) {
  const quest = currentQuest(goals, now)
  if (!quest) return { quest: null, state: null, justDone: false }
  const recorded = getQuestsDone().some((d) => d.week === quest.week)
  if (recorded) return { quest, state: { done: true, progress: 1, hidden: false }, justDone: false }
  const state = questState(quest, goals, now)
  if (state.done) {
    addQuestDone({ week: quest.week, id: quest.id, at: new Date(now).toISOString() })
    return { quest, state, justDone: true }
  }
  return { quest, state, justDone: false }
}

// The XP a quest of the week gives (display): days5 gives 30, the others 40.
export const weeklyXp = (id) => (id === 'days5' ? 30 : 40)

// ---------------------------------------------------------------------------
// Daily quests (v1.2.0): three a day, the same three all day, new ones at local midnight. Nothing here pays NIM and
// nothing leaves the phone. Slot 1 is the check-in (the daily-visit 5 XP the app already gives; no new XP). Slots 2 and
// 3 are real quests from the pool, picked once per day (deterministic from the day) and kept. 5 XP per real quest,
// 15 for Add NIM, plus 5 when every slot is done. Graduation (7 full days in a row) drops the check-in for good.
// Storage: dibs.daily { day, slots:[{ id, goalId?, chip? }], done:[key], bonus } ; dibs.daily.days (lib/xp.js) keeps a
// compact per-day record for XP and the badges; dibs.daily.graduated { at } once.
export const DAILY_ALWAYS = ['savings', 'catalog', 'badges']
const dxp = (id) => (id === 'add' ? 15 : 5)
const DAILY_BONUS = 5
const activeGoal = (g) => g.status === 'saving' || g.status === 'unlocking' || g.status === 'ready'
const aheadOfPlan = (g, now) => { const k = planOf(g, now).pace.kind; return k === 'ahead' || k === 'done' }
const hasHistoryRow = (goals) => goals.some((g) => (g.deposits || []).length > 0 || g.status === 'redeemed' || g.status === 'withdrawn')
// A slot's storage key, unique within a day (goal and category slots carry their target).
export const slotKey = (s) => s.id === 'category' ? `category:${s.chip}` : (s.id === 'goal' || s.id === 'add') ? `${s.id}:${s.goalId}` : s.id
// A slot whose goal was deleted, bought or withdrawn is hidden (the day can still be finished with the rest).
const slotHidden = (s, goals) => (s.id === 'goal' || s.id === 'add') && goneGoal(goals.find((g) => g.id === s.goalId))

const readDaily = () => { try { return JSON.parse(localStorage.getItem('dibs.daily')) || null } catch { return null } }
const writeDaily = (s) => { try { localStorage.setItem('dibs.daily', JSON.stringify(s)) } catch { /* storage blocked */ } }
const getGraduated = () => { try { return JSON.parse(localStorage.getItem('dibs.daily.graduated')) || null } catch { return null } }
const setGraduated = (v) => { try { localStorage.setItem('dibs.daily.graduated', JSON.stringify(v)) } catch { /* storage blocked */ } }
export const isGraduated = () => Boolean(getGraduated())

// Small deterministic PRNG seeded from a string, so a given day gives the same shuffle (data decides the pool).
function seeded(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
}
function shuffle(arr, rnd) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

// Days this week (Monday week) that offered an Add NIM quest (dibs.daily.days), for the "at most twice a week" cap.
function addDaysThisWeek(now) {
  const wk = weekKey(now)
  return Object.entries(getDailyDays()).filter(([d, r]) => r && r.add && weekKey(dayStart(d)) === wk).length
}

// The quests the user can be offered today (real quests only; the check-in is added separately). Exported for tests.
export function dailyPool(goals, now = Date.now()) {
  const out = []
  const active = goals.filter(activeGoal)
  const savers = goals.filter(savingUnder100)
  if (active.length) out.push({ id: 'savings' })
  out.push({ id: 'catalog' })
  out.push({ id: 'badges' })
  if (active.length) {
    const used = new Set(active.map(chipOf))
    for (const c of CHIPS) if (!used.has(c)) out.push({ id: 'category', chip: c })
    for (const g of active) out.push({ id: 'goal', goalId: g.id })
  }
  if (hasHistoryRow(goals)) out.push({ id: 'history' })
  if (addDaysThisWeek(now) < 2) for (const g of savers) if (!aheadOfPlan(g, now)) out.push({ id: 'add', goalId: g.id })
  return out
}

// Today's set, picked deterministically from the day and the data. Two real slots (three once graduated), two different
// quests, preferring at most one "anytime" quest when a goal quest is available.
export function pickDaily(goals = [], now = Date.now()) {
  const day = dayKey(now)
  const grad = getGraduated()
  const graduated = Boolean(grad && grad.at < day)
  const need = graduated ? 3 : 2
  const shuffled = shuffle(dailyPool(goals, now), seeded(day))
  const hasOther = shuffled.some((q) => !DAILY_ALWAYS.includes(q.id))
  const slots = []
  const ids = new Set()
  let always = 0
  const take = (limitAlways) => {
    for (const q of shuffled) {
      if (slots.length >= need) break
      if (ids.has(q.id)) continue
      const isAlways = DAILY_ALWAYS.includes(q.id)
      if (limitAlways && isAlways && hasOther && always >= 1) continue
      slots.push(q); ids.add(q.id); if (isAlways) always += 1
    }
  }
  take(true)
  if (slots.length < need) take(false) // the always-limit left us short: relax it
  const all = graduated ? slots : [{ id: 'open' }, ...slots]
  return { day, slots: all, done: graduated ? [] : ['open'], bonus: false, shown: [] }
}

// The compact per-day record (dibs.daily.days) for XP and the Quests badges. Exported for tests.
export function dayRecord(set, goals = []) {
  const visible = set.slots.filter((s) => !slotHidden(s, goals))
  const real = visible.filter((s) => s.id !== 'open') // visible real quests (the check-in aside)
  const doneReal = real.filter((s) => set.done.includes(slotKey(s)))
  // A day is full only when there is at least one real quest and every visible slot is done (the check-in alone, with
  // both real slots hidden, never counts as a full day).
  const full = real.length > 0 && visible.every((s) => set.done.includes(slotKey(s)))
  const xp = doneReal.reduce((sum, s) => sum + dxp(s.id), 0) + (full ? DAILY_BONUS : 0)
  return { xp, quests: doneReal.length, full, add: real.some((s) => s.id === 'add') }
}

// Today's set, re-picking (and recording the fresh day) when the day has rolled over.
export function currentDaily(goals = [], now = Date.now()) {
  const stored = readDaily()
  if (stored && stored.day === dayKey(now)) return stored
  const set = pickDaily(goals, now)
  writeDaily(set)
  recordDailyDay(set.day, dayRecord(set, goals)) // persists the Add-offered flag and a zero-XP row for the week cap
  return set
}

// { slots (visible, with done), doneCount, total, full, shown }. Hidden slots (gone goals) drop out of the count.
// Full only when at least one real quest is done, not the check-in alone (both real slots hidden).
export function dailyState(set, goals = [], now = Date.now()) {
  if (!set) return { slots: [], doneCount: 0, total: 0, full: false, shown: [] }
  const visible = set.slots.filter((s) => !slotHidden(s, goals))
  const slots = visible.map((s) => ({ ...s, key: slotKey(s), done: set.done.includes(slotKey(s)) }))
  const doneCount = slots.filter((s) => s.done).length
  const reals = slots.filter((s) => s.id !== 'open')
  return { slots, doneCount, total: slots.length, full: reals.length > 0 && doneCount === slots.length, day: set.day, shown: set.shown || [] }
}

function persist(set, goals) {
  set.bonus = dailyState(set, goals).full
  writeDaily(set)
  recordDailyDay(set.day, dayRecord(set, goals))
}

// Marks any slot this open completes (savings, catalog, a category/brand, a goal's details, history, badges). Returns
// the keys newly done. Called by the one-line "opened" hooks in the screens.
export function markDailyOpen(ev, goals = [], now = Date.now()) {
  const set = currentDaily(goals, now)
  const matches = (s) => (
    s.id === 'savings' ? ev.k === 'savings'
    : s.id === 'catalog' ? ev.k === 'brand'
    : s.id === 'category' ? ev.k === 'brand' && ev.chip === s.chip
    : s.id === 'goal' ? ev.k === 'goal' && ev.goalId === s.goalId
    : s.id === 'history' ? ev.k === 'history'
    : s.id === 'badges' ? ev.k === 'badges'
    : false)
  const fresh = []
  for (const s of set.slots) {
    const key = slotKey(s)
    if (!set.done.includes(key) && !slotHidden(s, goals) && matches(s)) { set.done.push(key); fresh.push(key) }
  }
  if (fresh.length) persist(set, goals)
  maybeGraduate(now)
  return fresh
}

// Records that a done quest's completion moment has been shown, so it never replays (including after a reload). Called by
// the Today card once it has played the moment for a done quest it had not shown yet.
export function markDailyShown(keys, goals = [], now = Date.now()) {
  const set = currentDaily(goals, now)
  const shown = new Set(set.shown || [])
  let changed = false
  for (const k of keys) if (!shown.has(k)) { shown.add(k); changed = true }
  if (changed) { set.shown = [...shown]; writeDaily(set); fireXp() }
}

// Ensures today's set exists, completes the Add NIM quest by reading the goal's deposits (a real deposit dated today),
// and handles graduation. Returns the day's state. Called by App.jsx next to recordVisit and checkQuest.
export function checkDaily(goals = [], now = Date.now()) {
  const set = currentDaily(goals, now)
  const today = dayKey(now)
  let changed = false
  for (const s of set.slots) {
    if (s.id !== 'add' || slotHidden(s, goals)) continue
    const key = slotKey(s)
    if (set.done.includes(key)) continue
    const g = goals.find((x) => x.id === s.goalId)
    if (g && (g.deposits || []).some((d) => realDeposit(d) && dayKey(Date.parse(d.at)) === today)) { set.done.push(key); changed = true }
  }
  if (changed) persist(set, goals)
  maybeGraduate(now)
  return dailyState(set, goals, now)
}

// Consecutive days ending today whose record is full. Steps back by calendar day (new Date(y, m, d - 1)), never by a
// fixed 24 h, so a 23-hour day (clock change) is not skipped. Exported for tests.
export function consecutiveFull(now) {
  const days = getDailyDays()
  let count = 0
  const d = new Date(now)
  let y = d.getFullYear(); let m = d.getMonth(); let day = d.getDate()
  while (true) {
    const key = dayKey(new Date(y, m, day).getTime())
    if (!(days[key] && days[key].full)) break
    count += 1
    day -= 1 // new Date(y, m, 0) rolls back into the previous month and year on its own
  }
  return count
}
// Once all three quests are done on 7 days in a row, store graduation (effective from the next day): no more check-in.
function maybeGraduate(now) {
  if (getGraduated()) return
  if (consecutiveFull(now) >= 7) setGraduated({ at: dayKey(now) })
}
