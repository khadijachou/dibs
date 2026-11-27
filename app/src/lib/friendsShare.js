// Pure: builds the body for PUT /v1/me/shared. It holds ONLY the items whose visibility is not off, and only
// data the server accepts. From v1.4.2 that can include, when the user turns them on: the saved and earned NIM
// totals, the user's Nimiq avatar (a data URL made on the phone), and the face value of goals and cards.
// Never an amount for an off item, never a goal name, a date, a wallet address or a balance.
import { progress } from './goals.js'

const KEY_RE = /^[a-z0-9_-]{1,32}$/
// A card/goal value as shown on a card ("20 USD", "25 EUR"): the same rule the server enforces.
const VALUE_RE = /^[\p{L}\p{N} .,'-]+$/u
const OPEN = new Set(['saving', 'unlocking', 'ready'])
const keys = (arr, max) => [...new Set((Array.isArray(arr) ? arr : []).filter((k) => typeof k === 'string' && KEY_RE.test(k)))].slice(0, max)

// A goal's face value and currency as one string ("20 USD"), with a plain space so it passes VALUE_RE
// (detailText joins them with a no-break space, which the server rule rejects). undefined when there is none.
export function cardValue(goal) {
  const v = [goal?.faceValue, goal?.currency].filter((x) => x != null && x !== '').map(String).join(' ').trim()
  return v.length >= 1 && v.length <= 24 && VALUE_RE.test(v) ? v : undefined
}
const withValue = (brandKey, value) => (value ? { brandKey, value } : { brandKey })

// visibility: the owner's map. xp: { level, rank, total } (total = the Profile XP total, for the Friends board, v1.7.10).
// badges: earned ids. goals: the ledger. wishlist: brand keys.
// saved/earned: whole-NIM numbers for totals (earned may be null = unknown, then it is omitted). avatar: a data URL.
// giftGoalIds: ids of goals a friend called dibs on; they are a surprise for someone else, so they never appear in my
// shared active goals or bought cards (the friend must not see "Steam 20 USD" turn up in my profile).
export function sharedPayload({ visibility = {}, xp = null, badges = [], goals = [], wishlist = [], saved = null, earned = null, avatar = null, giftGoalIds = [] } = {}) {
  const on = (k) => visibility[k] === 'friends' || visibility[k] === 'everyone'
  const gift = new Set(Array.isArray(giftGoalIds) ? giftGoalIds : [])
  const list = (Array.isArray(goals) ? goals : []).filter((g) => !gift.has(g?.id)) // gift goals stay a surprise
  const body = {}

  if (on('avatar') && typeof avatar === 'string' && avatar.startsWith('data:image/')) body.avatar = avatar
  if (on('totals') && typeof saved === 'number' && Number.isFinite(saved)) {
    body.totals = { saved: Math.max(0, Math.floor(saved)) }
    if (typeof earned === 'number' && Number.isFinite(earned)) body.totals.earned = Math.max(0, Math.floor(earned)) // omitted when unknown (null)
  }
  if (on('level') && xp && Number.isFinite(xp.level) && xp.level >= 1 && typeof xp.rank === 'string' && KEY_RE.test(xp.rank)) {
    body.level = { level: Math.min(999, Math.round(xp.level)), rank: xp.rank }
    if (Number.isFinite(xp.total)) body.level.xp = Math.max(0, Math.min(10_000_000, Math.round(xp.total)))
  }
  if (on('badges')) body.badges = keys(badges, 60)
  if (on('cards')) {
    // Every bought card (not unique any more), each with its value when known.
    body.cards = list.filter((g) => g?.status === 'redeemed' && typeof g.brandKey === 'string' && KEY_RE.test(g.brandKey))
      .slice(0, 60).map((g) => withValue(g.brandKey, cardValue(g)))
  }
  if (on('goals')) {
    const out = []
    for (const g of list) {
      if (!g || !OPEN.has(g.status)) continue
      if (typeof g.brandKey !== 'string' || !KEY_RE.test(g.brandKey)) continue // a goal with no brand key is skipped
      const pct = Math.max(0, Math.min(100, Math.round(progress(g) * 100)))
      const value = cardValue(g)
      out.push(value ? { brandKey: g.brandKey, pct, value } : { brandKey: g.brandKey, pct })
      if (out.length >= 12) break
    }
    body.goals = out
  }
  if (on('wishlist')) body.wishlist = keys(wishlist, 60)
  return body
}
