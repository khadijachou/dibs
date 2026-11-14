// Display-only ranking of the Home goals: the order that needs the user, not the stored order.
// Pure, so `npm test` runs it. Nothing here is written back to a goal and the stored list is never reordered.
//
// ctx carries what the function cannot know alone, so it stays pure:
//   ctx.now  - the clock, to read a saving goal's pace and an unlocking goal's release (defaults to Date.now()).
//   ctx.due  - optional { [goalId]: true|false } override for an unlocking goal's release. When a goal is absent
//              from it, dueLocally decides from the goal's own unlock steps, so the order is final at first paint
//              (no chain read). An explicit false keeps a goal waiting.
//
// Ranks (main button on the card in brackets):
//   1 ready to buy            (Get my card)
//   2 unlocking, release due  (Finish unlock)
//   3 saving, 100% reached    (Start unlock)
//   4 unlocking, still waiting (Details)
//   5 saving, behind plan     (Add NIM)   kinds late + behind, most weeks behind first
//   6 saving, on track        (Add NIM)   closest to 100% first; also any saving goal whose pace cannot be read
//   7 saving, ahead of plan   (Add NIM)   closest to 100% first
// Ties inside a rank: nearest deadline first, then the oldest goal (createdAt).
import { planOf } from './pace.js'
import { FALLBACK_MS } from './release.js' // import only; release.js itself does not change

const PAST = 99 // redeemed or withdrawn: filtered out by rankGoals, never shown

// Is an unlocking goal's release due, read from its own unlock steps (no chain read, so the order is final at first
// paint)? True when a 'retire' step is on record, or when the 'deactivate' step's time + the 12 h 4 min fallback has
// passed. No deactivate step, an unreadable date, or any other status: false. Never throws.
export function dueLocally(goal, now = Date.now()) {
  if (!goal || goal.status !== 'unlocking') return false
  const steps = Array.isArray(goal.unlockSteps) ? goal.unlockSteps : []
  if (steps.some((s) => s?.step === 'retire')) return true
  const deactivate = steps.find((s) => s?.step === 'deactivate')
  const at = deactivate ? Date.parse(deactivate.at) : NaN
  if (!Number.isFinite(at)) return false
  return at + FALLBACK_MS <= now
}

// savedNim / progress without ever throwing on a broken goal (missing deposits, no target).
function savedOf(goal) {
  try { return (goal.deposits || []).reduce((s, d) => s + (Number(d?.nim) || 0), 0) } catch { return 0 }
}
function progressOf(goal) {
  const target = Number(goal?.targetNim)
  if (!(target > 0)) return 0
  return Math.min(1, savedOf(goal) / target)
}
// The pace kind of a saving goal, or null when it cannot be read (no deadline, bad data). Never throws.
function paceOf(goal, now) {
  try { return planOf(goal, now) } catch { return null }
}

// The rank number of one goal (exported for the tests and for Next up).
export function rankOf(goal, ctx = {}) {
  const now = ctx.now ?? Date.now()
  const status = goal?.status
  if (status === 'redeemed' || status === 'withdrawn') return PAST
  if (status === 'ready') return 1
  if (status === 'unlocking') return (ctx.due?.[goal.id] ?? dueLocally(goal, now)) ? 2 : 4
  // saving-ish: 100% reached (Start unlock) ranks above a goal still filling up
  const target = Number(goal?.targetNim)
  if (target > 0 && savedOf(goal) >= target) return 3
  const kind = paceOf(goal, now)?.pace?.kind
  if (kind === 'late' || kind === 'behind') return 5
  if (kind === 'ahead') return 7
  return 6 // onTrack, done, or unreadable pace
}

// Sort keys used to break ties inside a rank. Never throws.
function keyOf(goal, now) {
  const p = paceOf(goal, now)
  const deadline = Date.parse(goal?.deadline)
  const createdAt = Date.parse(goal?.createdAt)
  return {
    lagWeeks: p ? p.lagWeeks : 0,
    prog: progressOf(goal),
    deadline: Number.isFinite(deadline) ? deadline : Infinity,
    createdAt: Number.isFinite(createdAt) ? createdAt : Infinity,
  }
}

function compare(a, b, ctx) {
  const ra = rankOf(a.g, ctx)
  const rb = rankOf(b.g, ctx)
  if (ra !== rb) return ra - rb
  const ka = keyOf(a.g, ctx.now)
  const kb = keyOf(b.g, ctx.now)
  if (ra === 5 && ka.lagWeeks !== kb.lagWeeks) return kb.lagWeeks - ka.lagWeeks // most weeks behind first
  if ((ra === 6 || ra === 7) && ka.prog !== kb.prog) return kb.prog - ka.prog // closest to 100% first
  if (ka.deadline !== kb.deadline) return ka.deadline - kb.deadline // nearest deadline first
  if (ka.createdAt !== kb.createdAt) return ka.createdAt - kb.createdAt // oldest goal first
  return a.i - b.i // stable: keep the input order on a full tie
}

// A new array of the goals in display order. The input array and its goals are never mutated.
// Redeemed and withdrawn goals are left out.
export function rankGoals(goals, ctx = {}) {
  const c = { now: ctx.now ?? Date.now(), due: ctx.due || {} }
  return (goals || [])
    .filter((g) => g && g.status !== 'redeemed' && g.status !== 'withdrawn')
    .map((g, i) => ({ g, i }))
    .sort((a, b) => compare(a, b, c))
    .map((x) => x.g)
}

// Savings > Next up: the first ranked goal that is not unlocking, so Home and Next up never disagree
// (unlocking goals keep their own card on Savings). No release read here: unlocking goals are skipped anyway.
export function nextUpGoal(goals, now) {
  return rankGoals(goals, { now }).find((g) => g.status !== 'unlocking') || null
}

// The goal the user left Home for, so Home can open on it when they come back (rule 2). In memory only,
// never storage, and cleared once read. Set from Home when a card button is tapped; read when Home opens.
let leftFor = null
export function noteLeftFor(id) { leftFor = id || null }
export function peekLeftFor() { return leftFor } // read without clearing (safe under StrictMode double-render)
export function clearLeftFor() { leftFor = null }
export function takeLeftFor() { const id = leftFor; leftFor = null; return id }
