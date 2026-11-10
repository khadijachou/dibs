// Quest of the week: one optional quest per week (Monday to Sunday, local time), picked the first time the app checks
// during that week and kept in dibs.quest so it never changes mid-week. Nothing is lost when it is not done.
// Done quests give XP (lib/xp.js); nothing here pays NIM or leaves the phone.
import { savedNim } from './goals.js'
import { planOf } from './pace.js'
import { CHIPS } from './brands.js'
import { chipOf } from './badges.js'
import { addQuestDone, getQuestsDone, isoWeek, weekKey, weekStart } from './xp.js'
import { MIN_NEW_STAKER_NIM } from './config.js'

export const KINDS = ['round', 'week', 'new']
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

// The kinds that apply, in the order round, week, new; index = ISO week number mod count. null: no quest this week.
export function pickQuest(goals = [], now = Date.now()) {
  const options = [pickRound(goals), pickWeek(goals, now), pickNew(goals)].filter(Boolean)
  if (!options.length) return null
  return { week: weekKey(now), ...options[isoWeek(now) % options.length] }
}

const goneGoal = (goal) => !goal || goal.status === 'redeemed' || goal.status === 'withdrawn'

// { done, progress 0..1, hidden }. hidden: the quest's goal was deleted, bought or withdrawn (the card goes away).
export function questState(quest, goals = [], now = Date.now()) {
  if (!quest) return { done: false, progress: 0, hidden: true }
  const from = weekStart(now)
  if (quest.id === 'new') {
    const done = goals.some((g) => chipOf(g) === quest.chip && Date.parse(g.createdAt) >= from)
    return { done, progress: done ? 1 : 0, hidden: false }
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
