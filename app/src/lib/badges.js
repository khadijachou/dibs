// Badges: worked out on the phone from data the app already has (goal ledger, the earned figure, the share flag).
// Nothing here is sent anywhere. evaluate() is pure; check() records newly met badges on this device.
import { savedNim } from './goals.js'
import { BRANDS, CHIPS } from './brands.js'
import { planOf } from './pace.js'

// In display order. group: way (On the way), set (Collection), grow (Earned from staking), special.
export const BADGES = [
  { id: 'first', group: 'way', glyph: 'flag' },
  { id: 'planted', group: 'way', glyph: 'seed' },
  { id: 'growing', group: 'way', glyph: 'up' },
  { id: 'halfway', group: 'way', glyph: 'half' },
  { id: 'patient', group: 'way', glyph: 'glass' },
  { id: 'dibs', group: 'way', glyph: 'dmark' },
  { id: 'ahead', group: 'way', glyph: 'fast' },
  { id: 'comeback', group: 'way', glyph: 'loop' },
  { id: 'juggler', group: 'way', glyph: 'three' },
  { id: 'rebalancer', group: 'way', glyph: 'swap' },
  { id: 'player', group: 'set', glyph: 'pad', chip: 'games' },
  { id: 'globe', group: 'set', glyph: 'plane', chip: 'travel' },
  { id: 'movie', group: 'set', glyph: 'play', chip: 'streaming' },
  { id: 'foodie', group: 'set', glyph: 'fork', chip: 'food' },
  { id: 'unboxed', group: 'set', glyph: 'box', chip: 'shopping' },
  { id: 'fullset', group: 'set', glyph: 'star' },
  { id: 'sprout', group: 'grow', glyph: 'leaf1', nim: 10 },
  { id: 'orchard', group: 'grow', glyph: 'leaf2', nim: 100 },
  { id: 'forest', group: 'grow', glyph: 'leaf3', nim: 1000 },
  { id: 'dayone', group: 'quest', glyph: 'calcheck' },
  { id: 'days7', group: 'quest', glyph: 'seven' },
  { id: 'quests50', group: 'quest', glyph: 'fifty' },
  { id: 'cycle3', group: 'special', glyph: 'iii' },
  { id: 'spread', group: 'special', glyph: 'share' },
]
export const GROUPS = ['way', 'set', 'grow', 'quest', 'special']
export const badgeById = (id) => BADGES.find((b) => b.id === id) || null

// Cycle III: the Nimiq Mini Apps Competition runs until the end of November 2026.
export const CYCLE3_END = Date.parse('2026-12-01T00:00:00Z')
const COMEBACK_GAP = 8 * 864e5

const isOpen = (g) => g.status !== 'redeemed' && g.status !== 'withdrawn'
const byTime = (a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0)
// Real deposits: NIM sent from the wallet (not a move between goals, not a withdrawal).
const realDeposits = (g) => (g.deposits || []).filter((d) => d.nim > 0 && d.kind !== 'move' && d.kind !== 'withdraw')
// The brand chip of a goal's card (games, travel, shopping, streaming, food). Unknown brands count as shopping, like brandOf.
export const chipOf = (g) => BRANDS.find((b) => b.key === g.brandKey)?.chip || 'shopping'

// When a goal first reached its target in the ledger (ms), or null.
function reachedAt(g) {
  let sum = 0
  for (const d of (g.deposits || []).slice().sort(byTime)) {
    sum += d.nim
    if (sum >= g.targetNim) return Date.parse(d.at) || null
  }
  return null
}

// On track or ahead now, the same rule as the goal dot (components/GoalStatus.jsx goalPace).
function onPace(g, now) {
  if (g.status !== 'saving' || savedNim(g) >= g.targetNim) return false
  const kind = planOf(g, now).pace.kind
  return kind !== 'late' && kind !== 'behind'
}

function hasGap(g) {
  const ds = realDeposits(g).sort(byTime)
  for (let i = 1; i < ds.length; i++) if (Date.parse(ds[i].at) - Date.parse(ds[i - 1].at) > COMEBACK_GAP) return true
  return false
}

// The badges whose condition holds now: [{ id, goalId? }], goalId = the goal that met it when there is one.
export function evaluate({ goals = [], earnedNim = 0, shared = false, dailyDays = {}, weeklyDone = 0, now = Date.now() }) {
  const earned = Number(earnedNim) || 0
  const out = []
  const add = (id, goal) => out.push(goal ? { id, goalId: goal.id } : { id })
  const find = (fn) => goals.find(fn)
  const redeemed = goals.filter((g) => g.status === 'redeemed')

  let g
  if ((g = goals.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0])) add('first', g)
  if ((g = find((x) => realDeposits(x).length > 0))) add('planted', g)
  if (earned > 0) add('growing')
  if ((g = find((x) => x.targetNim > 0 && savedNim(x) >= 0.5 * x.targetNim))) add('halfway', g)
  if ((g = find((x) => x.status === 'ready' || (x.status === 'redeemed' && (x.unlockSteps || []).length > 0)))) add('patient', g)
  if ((g = redeemed[0])) add('dibs', g)
  if ((g = find((x) => { const at = reachedAt(x); return at != null && at <= Date.parse(x.deadline) }))) add('ahead', g)
  if ((g = find((x) => hasGap(x) && onPace(x, now)))) add('comeback', g)
  if (goals.filter(isOpen).length >= 3) add('juggler')
  if ((g = find((x) => (x.deposits || []).some((d) => d.kind === 'move')))) add('rebalancer', g)
  for (const b of BADGES.filter((x) => x.chip)) {
    if ((g = redeemed.find((x) => chipOf(x) === b.chip))) add(b.id, g)
  }
  if (CHIPS.every((c) => redeemed.some((x) => chipOf(x) === c))) add('fullset')
  for (const b of BADGES.filter((x) => x.nim)) if (earned >= b.nim) add(b.id)
  // Quests group (daily records in dibs.daily.days, plus the weekly quests done). quests50 counts real daily quests
  // (never the check-in) and weekly quests; dayone/days7 count whole days finished (not in a row).
  const recs = Object.values(dailyDays || {})
  const fullDays = recs.filter((r) => r && r.full).length
  const dailyQuests = recs.reduce((s, r) => s + (r && r.quests ? r.quests : 0), 0)
  if (fullDays >= 1) add('dayone')
  if (fullDays >= 7) add('days7')
  if (dailyQuests + (Number(weeklyDone) || 0) >= 50) add('quests50')
  if (now < CYCLE3_END) add('cycle3')
  if (shared) add('spread')
  return out
}

// Device-level storage, like dibs.name: { [id]: { at, goalId } }. A recorded badge is never removed.
const KEY = 'dibs.badges'
const SHARED = 'dibs.badges.shared'

function readRaw() {
  try { const v = localStorage.getItem(KEY); return v == null ? null : JSON.parse(v) || {} } catch { return {} }
}
export const getBadges = () => readRaw() || {}
export const isShared = () => { try { return localStorage.getItem(SHARED) === '1' } catch { return false } }
// Spread the word counts a real share only: the share sheet went through, or the copy + save + X page path ran.
export const shareEarns = (result) => result === 'shared' || result === 'fallback'
export const setShared = () => { try { localStorage.setItem(SHARED, '1') } catch { /* storage blocked */ } }

// Records the badges met now that are not recorded yet, and returns their ids (to announce). The very first check on
// a phone (no dibs.badges yet) records everything already met without announcing it: no stamp flood for existing users.
// Checks run one at a time, so two of them never announce the same badge.
let chain = Promise.resolve([])
export function check({ goals = [], earnedNim = 0, dailyDays = {}, weeklyDone = 0, now = Date.now() } = {}) {
  const run = () => {
    const raw = readRaw()
    const first = raw === null
    const have = raw || {}
    const met = evaluate({ goals, earnedNim, shared: isShared(), dailyDays, weeklyDone, now })
    const fresh = met.filter((m) => !have[m.id])
    if (!fresh.length && !first) return []
    const at = new Date(now).toISOString()
    const next = { ...have }
    for (const m of fresh) next[m.id] = { at, goalId: m.goalId || null }
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { return [] }
    if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('dibs:badges'))
    return first ? [] : fresh.map((m) => m.id)
  }
  chain = chain.then(run, run)
  return chain
}
