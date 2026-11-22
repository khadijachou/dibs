// Rank unlocks (v1.4.4): cosmetic looks tied to rank. Pure logic plus the stored choice on this phone. Nothing here
// pays NIM or grants XP. Three kinds: accent (the user's name, and the colour of the avatar frame), frame (a ring
// around the avatar) and ring (the saving-goal ring style). Each look is unlocked by reaching a rank (lib/xp.js RANKS).
// getLook(level) returns the stored choice with any entry not unlocked at this level (or unknown) replaced by its
// default, so a look never outlives its rank and bad data is harmless.
import { RANKS } from './xp.js'

// Each list is in rank order, lowest first. The first of each kind is the default (reached at Starter, level 1).
export const ACCENTS = [
  { id: 'coral', rank: 'starter' }, // the app's coral: the name keeps its normal colour (default)
  { id: 'mint', rank: 'saver' },
  { id: 'butter', rank: 'planner' },
  { id: 'cream', rank: 'collector' },
  { id: 'citrus', rank: 'collector' }, // a second Collector accent (v1.7.7): a gradient #FFC94D to #2BC48F
  { id: 'gold', rank: 'treasurer' },
  { id: 'sunset', rank: 'legend' }, // a gradient #E8482A to #FFC94D
]
export const FRAMES = [
  { id: 'none', rank: 'starter' },
  { id: 'saver', rank: 'saver' },
  { id: 'planner', rank: 'planner' },
  { id: 'collector', rank: 'collector' },
  { id: 'treasurer', rank: 'treasurer' },
  { id: 'legend', rank: 'legend' },
]
export const RINGS = [
  { id: 'solid', rank: 'starter' },
  { id: 'steps', rank: 'saver' },
  { id: 'glow', rank: 'planner' },
  { id: 'dots', rank: 'collector' },
  { id: 'gold', rank: 'treasurer' },
  { id: 'sunset', rank: 'legend' },
]
export const KINDS = { accent: ACCENTS, frame: FRAMES, ring: RINGS }
export const KIND_IDS = ['accent', 'frame', 'ring']
export const DEFAULTS = { accent: 'coral', frame: 'none', ring: 'solid' }

const rankLevel = (rankId) => (RANKS.find((r) => r.id === rankId) || RANKS[0]).level
// The level at which a given look unlocks (Infinity for an unknown id).
export const levelFor = (kind, id) => { const e = KINDS[kind]?.find((x) => x.id === id); return e ? rankLevel(e.rank) : Infinity }

export function isUnlocked(kind, id, level) {
  const list = KINDS[kind]
  if (!list) return false
  const e = list.find((x) => x.id === id)
  if (!e) return false
  return level >= rankLevel(e.rank)
}
// The ids available at this level, per kind: { accent: [...], frame: [...], ring: [...] }.
export const unlocked = (level) => Object.fromEntries(KIND_IDS.map((k) => [k, KINDS[k].filter((e) => level >= rankLevel(e.rank)).map((e) => e.id)]))

// ---- the stored choice (this phone only) --------------------------------------------------------------------
const KEY = 'dibs.look' // { accent, frame, ring, rankSeen }
export const LOOK_EVENT = 'dibs:look'
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {} } catch { return {} } }
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private mode */ } }
const notify = () => { try { window.dispatchEvent(new Event(LOOK_EVENT)) } catch { /* no window */ } }

// The stored choice, each entry replaced by its default when not unlocked at this level or unknown.
export function getLook(level = 1) {
  const raw = read()
  const out = {}
  for (const kind of KIND_IDS) {
    const id = raw[kind]
    out[kind] = typeof id === 'string' && isUnlocked(kind, id, level) ? id : DEFAULTS[kind]
  }
  return out
}
// Equip a look. A locked or unknown id is ignored (defensive: the screen never offers one, and hand-edited data falls
// back through getLook anyway).
export function setLook(kind, id, level = 1) {
  if (!KIND_IDS.includes(kind) || !isUnlocked(kind, id, level)) return
  write({ ...read(), [kind]: id })
  notify()
}
// Back to the three defaults; rankSeen is kept.
export function resetLook() {
  const { accent, frame, ring, ...rest } = read() // eslint-disable-line no-unused-vars
  write(rest)
  notify()
}
// The accent the user explicitly equipped and can still use at this level, or null when they never chose one. getLook
// resolves an unchosen accent to the default (coral) for swatches and sending; this keeps "never chose" apart from
// "chose Coral", so a name only takes the coral colour once the user actually picks Coral.
export function accentChoice(level = 1) {
  const id = read().accent
  return typeof id === 'string' && isUnlocked('accent', id, level) ? id : null
}
// True when the effective look at this level is the three defaults.
export function isDefaultLook(level = 1) {
  const l = getLook(level)
  return l.accent === DEFAULTS.accent && l.frame === DEFAULTS.frame && l.ring === DEFAULTS.ring
}

// ---- the rank-reached sheet (dibs.look.rankSeen) ------------------------------------------------------------
export const getRankSeen = () => read().rankSeen || null
export const markRankSeen = (rankId) => write({ ...read(), rankSeen: rankId })
// The rank id to announce once (a new, higher rank than the last seen), or null. First run stores the current rank
// silently and announces nothing (so an update day shows no sheet for ranks already reached).
export function rankToAnnounce(currentRankId) {
  const raw = read()
  if (raw.rankSeen == null) { write({ ...raw, rankSeen: currentRankId }); return null }
  const order = RANKS.map((r) => r.id)
  return order.indexOf(currentRankId) > order.indexOf(raw.rankSeen) ? currentRankId : null
}
