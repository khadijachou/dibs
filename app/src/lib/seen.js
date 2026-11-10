// What the user has already seen celebrated, so each animation plays once (display only, this device only).
//   dibs.seen.burst      goal ids whose 100 % burst has played
//   dibs.seen.level      { level, into } last shown on the Profile Level card (a plain number from older builds is read too)
//   dibs.seen.levelBand  the last level announced in the band (BadgeStamp)
//   dibs.seen.badges     badge ids already popped on Profile
// First run of this version: a missing key is created from the current state, silently, so nothing reached before
// the update is celebrated. Reads are pure apart from that first write, so React StrictMode's double render agrees.
const KEYS = { burst: 'dibs.seen.burst', level: 'dibs.seen.level', levelBand: 'dibs.seen.levelBand', badges: 'dibs.seen.badges' }

const raw = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const read = (key, fallback) => { try { const v = JSON.parse(raw(key)); return v ?? fallback } catch { return fallback } }
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode */ } }
const list = (key) => { const v = read(key, []); return Array.isArray(v) ? v : [] }

// ---- A) goal complete burst
// goals: every goal on the device; those at 100 % or more when this first runs never burst.
export function initBurst(goals, isFull) {
  if (raw(KEYS.burst) != null) return
  write(KEYS.burst, goals.filter(isFull).map((g) => g.id))
}
// A missing key (initBurst not run) counts as seen: never celebrate an old goal by mistake.
export const burstSeen = (goalId) => raw(KEYS.burst) == null || list(KEYS.burst).includes(goalId)
export function markBurst(goalId) {
  const l = list(KEYS.burst)
  if (!l.includes(goalId)) write(KEYS.burst, [...l, goalId])
}

// ---- B) level up
// The Level card: { from, into } (the last level shown and its XP into that level) when `level` is higher, else null.
// First run: stores the current level, returns null.
export function levelToPlay(level, into = 0) {
  const s = raw(KEYS.level)
  if (s == null) { write(KEYS.level, { level, into }); return null }
  const v = read(KEYS.level, null)
  const from = typeof v === 'number' ? v : Number(v?.level)
  if (!Number.isFinite(from)) { write(KEYS.level, { level, into }); return null }
  return level > from ? { from, into: Number(v?.into) || 0 } : null
}
export const setLevelSeen = (level, into = 0) => write(KEYS.level, { level, into })

// The band: the levels to announce (from the last announced + 1 up to `level`, the highest only), or null.
// First run: stores the current level, returns null.
export function levelBandToAnnounce(level) {
  const s = raw(KEYS.levelBand)
  if (s == null) { write(KEYS.levelBand, level); return null }
  const last = Number(read(KEYS.levelBand, level))
  if (!(level > last)) return null
  write(KEYS.levelBand, level)
  return level
}

// ---- C) new badge in Profile
// The earned ids not popped yet. First run: every earned id is marked seen and nothing pops.
export function newBadges(earnedIds) {
  if (raw(KEYS.badges) == null) { write(KEYS.badges, [...earnedIds]); return [] }
  const s = new Set(list(KEYS.badges))
  return earnedIds.filter((id) => !s.has(id))
}
export function markBadges(ids) {
  const l = list(KEYS.badges)
  const add = ids.filter((id) => !l.includes(id))
  if (add.length) write(KEYS.badges, [...l, ...add])
}
