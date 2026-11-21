// Gifting: call dibs on a friend's wish. A gift goal is a NORMAL goal (same deposits, earning, unlock and payment);
// the only extra is a local "gift tag" kept in its own storage key, keyed by goal id, so the goal object in the
// ledger never changes shape. The Friends server learns three things only (who called dibs on which brand of whose
// wishlist, whether it was sent, whether thanks were said): a code, a PIN, a link, a value, an amount, the goal id
// and the goal's money path never reach it.
import { request } from './friends.js'

const KEY = 'dibs.friends.gifts' // { [goalId]: { friendId, name, brandKey, state: 'claimed' | 'sent', thanked? } }

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
const write = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* private mode */ } }

export const giftOf = (goalId) => (goalId ? read()[goalId] || null : null)
export const giftGoalIds = () => Object.keys(read())

// Save or merge a tag. name is the friend's display name at the time (for the pill when offline).
export function setGift(goalId, tag) {
  const m = read()
  m[goalId] = { ...m[goalId], ...tag }
  write(m)
}
export function markSent(goalId) { const m = read(); if (m[goalId]) { m[goalId].state = 'sent'; write(m) } }
export function setThanked(goalId, thanked = true) { const m = read(); if (m[goalId]) { m[goalId].thanked = thanked; write(m) } }
export function clearGift(goalId) { const m = read(); if (goalId in m) { delete m[goalId]; write(m) } }
export function clearAll() { try { localStorage.removeItem(KEY) } catch { /* private mode */ } } // Friends off / delete profile

// ---- the Friends API (all signed, through friends.js request) -----------------------------------------------
const wish = (friendId, brandKey, tail = '') => `/v1/users/${encodeURIComponent(friendId)}/wishes/${encodeURIComponent(brandKey)}${tail}`
export const claim = (friendId, brandKey) => request('POST', wish(friendId, brandKey, '/claim'))
export const releaseClaim = (friendId, brandKey) => request('DELETE', wish(friendId, brandKey, '/claim'))
export const sendSent = (friendId, brandKey) => request('POST', wish(friendId, brandKey, '/sent'))
export const sayThanks = (brandKey) => request('POST', `/v1/me/gifts/${encodeURIComponent(brandKey)}/thanks`)

// Reconcile local tags with the goals that still exist. For each tag in state 'claimed' whose goal no longer exists,
// is withdrawn, or now points at another brand (the card was changed), release the claim on the server (quietly) and
// drop the tag. A tag in state 'sent' whose goal was deleted is dropped locally, with no server call (the gift is
// already on its way; the owner's side keeps it). `release` is injected so tests can pass a fake request.
export async function reconcile(goals, release = releaseClaim) {
  const m = read()
  const byId = new Map((Array.isArray(goals) ? goals : []).map((g) => [g.id, g]))
  let changed = false
  for (const [goalId, tag] of Object.entries(m)) {
    const g = byId.get(goalId)
    if (tag.state === 'sent') {
      if (!g) { delete m[goalId]; changed = true } // deleted sent gift: drop locally, never a server call
      continue
    }
    // state 'claimed'
    if (!g || g.status === 'withdrawn' || g.brandKey !== tag.brandKey) {
      try { await release(tag.friendId, tag.brandKey) } catch { /* quiet: the server reconciles on its own too */ }
      delete m[goalId]
      changed = true
    }
  }
  if (changed) write(m)
}
