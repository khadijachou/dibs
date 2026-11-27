// Pure rules: input validation and the visibility filter. No storage, no crypto, no clock.
// Everything here is a plain function so the tests can check every case directly.

// v1.4.2: two new shareable items, avatar and totals. Seven in all, each off by default.
export const ITEMS = ['avatar', 'level', 'badges', 'totals', 'goals', 'cards', 'wishlist']
export const VISIBILITIES = ['off', 'friends', 'everyone']

const KEY_RE = /^[a-z0-9_-]{1,32}$/ // badge ids, brand keys, rank
const LOOK_RE = /^[a-z0-9_-]{1,16}$/ // accent, frame
// A card or goal value as shown on a card ("20 USD", "25 EUR", "2.50 EUR"): letters, numbers, space and . , ' -.
const VALUE_RE = /^[\p{L}\p{N} .,'-]+$/u
const isInt = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
const TOTAL_MAX = 999_999_999_999 // whole NIM

// A value string ("20 USD"): 1 to 24 chars, only the allowed characters.
const validValue = (v) => typeof v === 'string' && v.length >= 1 && v.length <= 24 && VALUE_RE.test(v)
// totals: { saved, earned? } whole NIM, saved required, earned optional. Extra keys are ignored (dropped).
const validTotals = (v) => Boolean(v) && typeof v === 'object' && isInt(v.saved, 0, TOTAL_MAX) && (v.earned === undefined || isInt(v.earned, 0, TOTAL_MAX))
// avatar: a data URL, one of two image types, base64 remainder, total length at most 12,288.
const AVATAR_PREFIXES = ['data:image/svg+xml;base64,', 'data:image/png;base64,']
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/
const validAvatar = (s) => {
  if (typeof s !== 'string' || s.length < 1 || s.length > 12288) return false
  const prefix = AVATAR_PREFIXES.find((p) => s.startsWith(p))
  if (!prefix) return false
  const b64 = s.slice(prefix.length)
  return b64.length > 0 && b64.length % 4 === 0 && B64_RE.test(b64)
}

// A gift message the giver types at "mark as sent" (v1.7.1). Only the message and the banner choice ever reach the
// server: never the code, the PIN, the link, a value or an amount. Line breaks become spaces, then it is trimmed; 0 to
// 140 code points. Returns the cleaned string ('' = no message), or null when it must be refused (too long, or a link).
const GIFT_LINK_PATH = /[a-z0-9]+\.[a-z]{2,24}\//i // a word.tld/ pattern: alphanumerics, a dot, 2 to 24 letters, a slash
function giftTextHasLink(s) {
  const low = s.toLowerCase()
  if (low.includes('http') || low.includes('www.')) return true
  return GIFT_LINK_PATH.test(s)
}
export function cleanGiftMessage(raw) {
  if (raw === undefined || raw === null) return ''
  if (typeof raw !== 'string') return null
  const text = raw.replace(/[\r\n\t]+/g, ' ').trim()
  if (text === '') return ''
  if ([...text].length > 140) return null
  if (giftTextHasLink(text)) return null
  return text
}

// A gift banner choice. One of the designs, or '' for none (absent, null or the string "none"). Anything else must be
// refused. The first four are chosen freely (v1.7.1); the seven after them the sender unlocks by level on their phone
// (v1.7.2) - the server does not check the level (looks only), it only accepts the id so the gift can carry it.
export const GIFT_BANNERS = [
  'birthday', 'thanks', 'congrats', 'because',
  'love', 'saver', 'planner', 'gamer', 'collector', 'treasurer', 'legend',
]
export function cleanGiftBanner(raw) {
  if (raw === undefined || raw === null || raw === 'none') return ''
  return GIFT_BANNERS.includes(raw) ? raw : null
}

// A gift card's value the giver chooses to show the receiver (v1.7.6): an amount, one space, a currency the shop uses
// ("20 USD", "2.50 EUR", "5000 NGN"). Up to 7 digits and at most 2 decimals. It is the ONLY money figure the server
// keeps about a gift, and it is shown only to the receiver (giftsReceived). Absent (old phones, plan cards like Discord)
// is fine: returns '' for undefined/null/empty. Anything that is not exactly this shape is refused (null -> 400 BAD_VALUE).
const GIFT_VALUE_RE = /^\d{1,7}(\.\d{1,2})? (USD|EUR|GBP|NGN)$/
export function cleanGiftValue(raw) {
  if (raw === undefined || raw === null || raw === '') return ''
  if (typeof raw !== 'string') return null
  return GIFT_VALUE_RE.test(raw) ? raw : null
}

// An encryption public key (X25519, 32 bytes) a device registers so a giver can seal a gift box for it (v1.7.3).
// Accepts hex (64 chars) or base64url (43 chars) and normalises to base64url, so the stored key and a box's `to` field
// (always base64url from the app) compare as equal strings. Returns null when it is not a valid 32-byte key.
const B64URL32 = /^[A-Za-z0-9_-]{43}$/
export function cleanEncPub(raw) {
  if (typeof raw !== 'string') return null
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex').toString('base64url')
  return B64URL32.test(raw) ? raw : null
}

// One sealed gift box { to, eph, iv, ct } (v1.7.3). `to` is a recipient public key (base64url 32 bytes); eph/iv/ct are
// base64url with sane caps (the plaintext is a tiny JSON of code/pin/link, so ct stays small). Shape only; the route
// also checks `to` against the owner's current keys and the 4 KB body limit bounds the whole set.
const B64URL = /^[A-Za-z0-9_-]+$/
export function validBox(b) {
  return Boolean(b) && typeof b === 'object'
    && typeof b.to === 'string' && B64URL32.test(b.to)
    && typeof b.eph === 'string' && b.eph.length >= 1 && b.eph.length <= 64 && B64URL.test(b.eph)
    && typeof b.iv === 'string' && b.iv.length >= 1 && b.iv.length <= 32 && B64URL.test(b.iv)
    && typeof b.ct === 'string' && b.ct.length >= 1 && b.ct.length <= 1024 && B64URL.test(b.ct)
}

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

// All seven visibilities, defaulting to off, from a (partial) stored map.
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

// Validates one shared item. Returns the value to store, or undefined to drop it. Malformed entries in the old
// shapes are dropped silently; the strict 400 for totals, avatar and a present value is decided by sharedHasError.
function cleanItem(key, v) {
  switch (key) {
    case 'avatar':
      return validAvatar(v) ? v : undefined
    case 'totals':
      return validTotals(v) ? { saved: v.saved, ...(v.earned !== undefined ? { earned: v.earned } : {}) } : undefined
    case 'level': {
      if (!v || typeof v !== 'object') return undefined
      if (!isInt(v.level, 1, 999)) return undefined
      if (typeof v.rank !== 'string' || !KEY_RE.test(v.rank)) return undefined
      const out = { level: v.level, rank: v.rank }
      // xp is the Profile XP total (v1.7.10), used to rank the Friends board. Integer 0 to 10,000,000. Older phones do
      // not send it; a present-but-malformed xp drops the whole item, like a bad level or rank.
      if (v.xp !== undefined) { if (!isInt(v.xp, 0, 10_000_000)) return undefined; out.xp = v.xp }
      return out
    }
    case 'badges':
    case 'wishlist': {
      if (!Array.isArray(v)) return undefined
      return v.filter((x) => typeof x === 'string' && KEY_RE.test(x)).slice(0, 60)
    }
    case 'cards': {
      // Old phones send brand-key strings; new phones send { brandKey, value? }. Stored as objects. Duplicates kept.
      if (!Array.isArray(v)) return undefined
      const out = []
      for (const c of v) {
        if (typeof c === 'string') { if (KEY_RE.test(c)) out.push({ brandKey: c }) } else if (c && typeof c === 'object' && typeof c.brandKey === 'string' && KEY_RE.test(c.brandKey)) {
          const entry = { brandKey: c.brandKey }
          if (validValue(c.value)) entry.value = c.value
          out.push(entry)
        }
        if (out.length >= 60) break
      }
      return out
    }
    case 'goals': {
      if (!Array.isArray(v)) return undefined
      const list = []
      for (const g of v) {
        if (!g || typeof g !== 'object') continue
        if (typeof g.brandKey !== 'string' || !KEY_RE.test(g.brandKey)) continue
        if (!isInt(g.pct, 0, 100)) continue
        const entry = { brandKey: g.brandKey, pct: g.pct }
        if (validValue(g.value)) entry.value = g.value
        list.push(entry)
        if (list.length >= 12) break
      }
      return list
    }
    default: return undefined
  }
}

// Strict validation for a PUT body: true when an ON item that is present is malformed in a way that must be rejected
// (totals, avatar, or a value that is present but bad). Old malformed shapes of the other fields stay a silent drop.
export function sharedHasError(input, visibility) {
  if (!input || typeof input !== 'object') return false
  const vis = fullVisibility(visibility)
  for (const k of ITEMS) {
    if (!(k in input) || vis[k] === 'off') continue
    const v = input[k]
    if (k === 'totals') { if (!validTotals(v)) return true; continue }
    if (k === 'avatar') { if (!validAvatar(v)) return true; continue }
    if ((k === 'goals' || k === 'cards') && Array.isArray(v)) {
      for (const e of v) if (e && typeof e === 'object' && 'value' in e && e.value !== undefined && !validValue(e.value)) return true
    }
  }
  return false
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
// owner = { id, name, visibility, shared, look }. The seed is the id, never the wallet.
// A friend sees items set to friends or everyone, plus hidden: the names of items kept off (never their data), but
// never avatar (an avatar kept private is not a line on the profile). A stranger sees only name and seed.
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
    if (vis[k] === 'off') { if (k !== 'avatar') hidden.push(k); continue }
    if (shared[k] !== undefined) out[k] = shared[k]
  }
  out.hidden = hidden
  return out
}

// True when the owner shares none of the seven items with a friend (all off).
export const sharesNothing = (visibility) => ITEMS.every((k) => fullVisibility(visibility)[k] === 'off')

// The wishes map a GIVEN viewer sees of an owner: for each brand on the owner's VISIBLE wishlist that has a claim,
// its status from that viewer's own side. Never who the other giver is. Brands with no claim are left out (the app
// then shows "Call dibs on it"). This is only ever computed for a real friend viewing the owner (GET /v1/users/:id):
// it is deliberately NOT part of visibleProfile, so the owner's own views (GET /v1/me, /v1/me/as-friend) stay free
// of any sign of a claim and the surprise holds.
//   wishlist: the brand keys on the owner's visible wishlist (shared.wishlist).
//   claims:   { [brandKey]: { by, state, thanked } } for that owner.
//   viewerId: the giver looking.
// Each value is an object { status } (plus thanked: true on a thanked 'mine_sent'):
//   'mine'       I called dibs (state claimed)      'mine_sent'  I marked it sent
//   'taken'      another friend called dibs          'gifted'     another friend marked it sent
// On my own 'mine_sent' only, v1.7.3 adds delivered: true (I delivered a sealed box in Dibs) and openedAt (my friend
// opened it), field by field. Never for another giver's 'gifted', and never a box: nobody else sees any of this.
export function wishesFor(wishlist, claims, viewerId) {
  const out = {}
  if (!Array.isArray(wishlist)) return out
  for (const brand of wishlist) {
    const rec = claims?.[brand]
    if (!rec) continue
    if (rec.by === viewerId) {
      if (rec.state === 'sent') {
        out[brand] = {
          status: 'mine_sent',
          ...(rec.thanked ? { thanked: true } : {}),
          ...(rec.deliveredAt ? { delivered: true } : {}),
          ...(rec.openedAt ? { openedAt: rec.openedAt } : {}),
        }
      } else out[brand] = { status: 'mine' }
    } else {
      out[brand] = { status: rec.state === 'sent' ? 'gifted' : 'taken' }
    }
  }
  return out
}
