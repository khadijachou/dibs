// Pure: builds the body for PUT /v1/me/shared. It holds ONLY the items whose visibility is not off, and only
// data the server accepts: brands, counts, a level and a percent. Never an amount, a goal name, a date or an id
// that is not a brand key. Everything here is a plain function so friendsShare.test.js can check every case.
import { progress } from './goals.js'

const KEY_RE = /^[a-z0-9_-]{1,32}$/
const uniq = (arr) => [...new Set(arr)]
const OPEN = new Set(['saving', 'unlocking', 'ready'])
const keys = (arr, max) => uniq((Array.isArray(arr) ? arr : []).filter((k) => typeof k === 'string' && KEY_RE.test(k))).slice(0, max)

// visibility: the owner's map (off | friends | everyone). xp: { level, rank } (rank is the rank id).
// badges: earned badge ids. goals: the goal ledger. wishlist: brand keys (dibs.wishlist).
export function sharedPayload({ visibility = {}, xp = null, badges = [], goals = [], wishlist = [] } = {}) {
  const on = (k) => visibility[k] === 'friends' || visibility[k] === 'everyone'
  const list = Array.isArray(goals) ? goals : []
  const body = {}

  if (on('level') && xp && Number.isFinite(xp.level) && xp.level >= 1 && typeof xp.rank === 'string' && KEY_RE.test(xp.rank)) {
    body.level = { level: Math.min(999, Math.round(xp.level)), rank: xp.rank }
  }
  if (on('badges')) body.badges = keys(badges, 60)
  if (on('cards')) body.cards = keys(list.filter((g) => g?.status === 'redeemed').map((g) => g?.brandKey), 60)
  if (on('goals')) {
    const out = []
    for (const g of list) {
      if (!g || !OPEN.has(g.status)) continue
      if (typeof g.brandKey !== 'string' || !KEY_RE.test(g.brandKey)) continue // a goal with no brand key is skipped
      out.push({ brandKey: g.brandKey, pct: Math.max(0, Math.min(100, Math.round(progress(g) * 100))) })
      if (out.length >= 12) break
    }
    body.goals = out
  }
  if (on('wishlist')) body.wishlist = keys(wishlist, 60)
  return body
}
