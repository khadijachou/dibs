// Pure rules: input validation and the visibility filter. No storage, no crypto, no clock.
// Everything here is a plain function so the tests can check every case directly.

export const ITEMS = ['level', 'badges', 'cards', 'goals', 'wishlist']
export const VISIBILITIES = ['off', 'friends', 'everyone']

const KEY_RE = /^[a-z0-9_-]{1,32}$/ // badge ids, brand keys, rank
const LOOK_RE = /^[a-z0-9_-]{1,16}$/ // accent, frame
const isInt = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi

// Name: 1 to 24 characters after trimming, control characters and line breaks removed, no "<" or ">".
export function cleanName(raw) {
  if (typeof raw !== 'string') return null
  const stripped = raw.replace(/[\x00-\x1f\x7f<>]/g, '').trim()
  if (stripped.length < 1 || stripped.length > 24) return null
  return stripped
}

// A visibility map with only valid keys and values, each one of off | friends | everyone.
export function cleanVisibility(input) {
  const out = {}
  if (input && typeof input === 'object') {
    for (const k of ITEMS) if (VISIBILITIES.includes(input[k])) out[k] = input[k]
  }
  return out
}

// All five visibilities, defaulting to off, from a (partial) stored map.
export const fullVisibility = (vis = {}) => Object.fromEntries(ITEMS.map((k) => [k, VISIBILITIES.includes(vis[k]) ? vis[k] : 'off']))

// look: two short strings kept for later, validated against /^[a-z0-9_-]{1,16}$/.
export function cleanLook(input) {
  const out = {}
  if (input && typeof input === 'object') {
    if (typeof input.accent === 'string' && LOOK_RE.test(input.accent)) out.accent = input.accent
    if (typeof input.frame === 'string' && LOOK_RE.test(input.frame)) out.frame = input.frame
  }
  return out
}

// Validates one shared item. Returns the value to store, or undefined to drop it.
function cleanItem(key, v) {
  switch (key) {
    case 'level': {
      if (!v || typeof v !== 'object') return undefined
      if (!isInt(v.level, 1, 999)) return undefined
      if (typeof v.rank !== 'string' || !KEY_RE.test(v.rank)) return undefined
      return { level: v.level, rank: v.rank }
    }
    case 'badges':
    case 'cards':
    case 'wishlist': {
      if (!Array.isArray(v)) return undefined
      return v.filter((x) => typeof x === 'string' && KEY_RE.test(x)).slice(0, 60)
    }
    case 'goals': {
      if (!Array.isArray(v)) return undefined
      const list = []
      for (const g of v) {
        if (!g || typeof g !== 'object') continue
        if (typeof g.brandKey !== 'string' || !KEY_RE.test(g.brandKey)) continue
        if (!isInt(g.pct, 0, 100)) continue
        list.push({ brandKey: g.brandKey, pct: g.pct })
        if (list.length >= 12) break
      }
      return list
    }
    default: return undefined
  }
}

// The new shared store after a PUT: keeps an item ONLY if its visibility is not off and the value is valid.
// `current` is what is already stored; `input` is the body; `visibility` is the owner's full map.
export function applyShared(current, input, visibility) {
  const vis = fullVisibility(visibility)
  const out = {}
  // Keep existing items that are still on.
  for (const k of ITEMS) if (vis[k] !== 'off' && current && current[k] !== undefined) out[k] = current[k]
  // Overlay the items sent in this request, dropping anything for an off item.
  if (input && typeof input === 'object') {
    for (const k of ITEMS) {
      if (!(k in input)) continue
      if (vis[k] === 'off') continue
      const cleaned = cleanItem(k, input[k])
      if (cleaned !== undefined) out[k] = cleaned
    }
  }
  return out
}

// Drops any stored item whose visibility is now off (used after a visibility change).
export function pruneShared(current, visibility) {
  const vis = fullVisibility(visibility)
  const out = {}
  for (const k of ITEMS) if (vis[k] !== 'off' && current && current[k] !== undefined) out[k] = current[k]
  return out
}

// What a viewer may see of an owner. viewerRelation: 'self' | 'friend' | 'stranger'.
// owner = { id, name, visibility, shared, look }. The avatar seed is the id, never the wallet.
// A friend sees items set to friends or everyone, plus hidden: the names of items kept off (never their data).
// A stranger sees only name and avatar seed. Self sees everything plus the visibility map.
export function visibleProfile(owner, viewerRelation) {
  const base = { id: owner.id, name: owner.name, seed: owner.id }
  if (viewerRelation === 'stranger') return base

  const vis = fullVisibility(owner.visibility)
  const shared = owner.shared || {}
  const out = { ...base, look: cleanLook(owner.look) }

  if (viewerRelation === 'self') {
    out.visibility = vis
    for (const k of ITEMS) if (shared[k] !== undefined) out[k] = shared[k]
    return out
  }

  // friend
  const hidden = []
  for (const k of ITEMS) {
    if (vis[k] === 'off') { hidden.push(k); continue }
    if (shared[k] !== undefined) out[k] = shared[k]
  }
  out.hidden = hidden
  return out
}

// True when the owner shares none of the five items with a friend (all off).
export const sharesNothing = (visibility) => ITEMS.every((k) => fullVisibility(visibility)[k] === 'off')
