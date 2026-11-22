// Gifting: call dibs on a friend's wish. A gift goal is a NORMAL goal (same deposits, earning, unlock and payment);
// the only extra is a local "gift tag" kept in its own storage key, keyed by goal id, so the goal object in the
// ledger never changes shape. The Friends server learns who called dibs on which brand of whose wishlist, whether it
// was sent, whether thanks were said, and (only at mark-as-sent, all optional) a short message, a banner choice and the
// card's value the giver typed (v1.7.6, shown only to the friend who gets it): a code, a PIN, a link, the NIM amount,
// the goal id and the goal's money path never reach it.
import { request } from './friends.js'

const KEY = 'dibs.friends.gifts' // { [goalId]: { friendId, name, brandKey, state: 'claimed' | 'sent', thanked?, message?, banner?, direct?, giftId? } }

// A direct gift id: 32 hex chars from the device's CSPRNG, generated on the phone so a retried send never makes two
// records (the server keys the record by it and treats a repeat as idempotent). Kept on the tag once generated.
export const newGiftId = () => { const a = new Uint8Array(16); globalThis.crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('') }

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
const write = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* private mode */ } }

export const giftOf = (goalId) => (goalId ? read()[goalId] || null : null)
export const giftGoalIds = () => Object.keys(read())
// How many gifts this phone has sent (state 'sent'), wishlist and direct alike: the Profile "Gifts sent" count (v1.7.6).
export const sentGiftCount = () => Object.values(read()).filter((t) => t && t.state === 'sent').length

// Save or merge a tag. name is the friend's display name at the time (for the pill when offline).
export function setGift(goalId, tag) {
  const m = read()
  m[goalId] = { ...m[goalId], ...tag }
  write(m)
}
// Mark the local tag sent, keeping the message and banner the giver sent (so the Done screen shows what was sent). A
// banner of 'none' (or empty) is not kept.
export function markSent(goalId, extra = {}) {
  const m = read()
  if (!m[goalId]) return
  m[goalId].state = 'sent'
  if (extra.message) m[goalId].message = extra.message
  if (extra.banner && extra.banner !== 'none') m[goalId].banner = extra.banner
  write(m)
}
export function setThanked(goalId, thanked = true) { const m = read(); if (m[goalId]) { m[goalId].thanked = thanked; write(m) } }
// Mark the local tag delivered in Dibs (the sealed boxes reached the server). Shown on the Done screen when the giver
// reopens the gift from Past dibs.
export function markDelivered(goalId) { const m = read(); if (m[goalId]) { m[goalId].delivered = true; write(m) } }
export function clearGift(goalId) { const m = read(); if (goalId in m) { delete m[goalId]; write(m) } }
export function clearAll() { try { localStorage.removeItem(KEY) } catch { /* private mode */ } } // Friends off / delete profile

// ---- received gift codes opened on this phone (v1.7.3) ------------------------------------------------------------
// When a receiver opens a gift delivered in Dibs, the redemption ({ code, pin, link }) is decrypted on the phone and
// kept here, so the Wishlist card can show it again with "Show code" after the server has deleted the box. A wishlist
// gift is keyed "<from id>:<brandKey>"; a direct gift (v1.7.4) by "d:<giftId>", so two direct gifts of the same brand
// each keep their own code. This is the receiver's own gift card, like a goal's saved redemption: it is NOT cleared by
// Friends off (that would lose a gift the server no longer holds). Never sent anywhere.
const IN_KEY = 'dibs.giftsIn'
const readIn = () => { try { return JSON.parse(localStorage.getItem(IN_KEY)) || {} } catch { return {} } }
const writeIn = (m) => { try { localStorage.setItem(IN_KEY, JSON.stringify(m)) } catch { /* private mode */ } }
// The storage key for a received gift: per giftId for a direct gift, per (giver, brand) for a wishlist gift.
export const giftInKeyOf = (gift) => (gift?.kind === 'direct' ? `d:${gift.giftId || ''}` : `${gift?.from?.id || ''}:${gift?.brandKey || ''}`)
export const getGiftIn = (gift) => readIn()[giftInKeyOf(gift)] || null
export function setGiftIn(gift, redemption) {
  if (!redemption) return
  const m = readIn()
  m[giftInKeyOf(gift)] = redemption
  writeIn(m)
}

// ---- the Friends API (all signed, through friends.js request) -----------------------------------------------
const wish = (friendId, brandKey, tail = '') => `/v1/users/${encodeURIComponent(friendId)}/wishes/${encodeURIComponent(brandKey)}${tail}`
export const claim = (friendId, brandKey) => request('POST', wish(friendId, brandKey, '/claim'))
export const releaseClaim = (friendId, brandKey) => request('DELETE', wish(friendId, brandKey, '/claim'))
export const sendSent = (friendId, brandKey, { message = '', banner = 'none', value = '' } = {}) => request('POST', wish(friendId, brandKey, '/sent'), { message, banner, value })
export const sayThanks = (brandKey) => request('POST', `/v1/me/gifts/${encodeURIComponent(brandKey)}/thanks`)
// Gift box relay (v1.7.3): read the receiver's gift-box public keys (giver, needs a claim), deliver the sealed boxes,
// and mark a received gift opened (owner). The code itself is sealed on the phone (lib/giftBox.js) and never reaches here.
export const getEncKeys = (friendId) => request('GET', `/v1/users/${encodeURIComponent(friendId)}/enc-keys`)
export const deliverGift = (friendId, brandKey, boxes) => request('POST', wish(friendId, brandKey, '/deliver'), { boxes })
export const markGiftOpened = (brandKey) => request('POST', `/v1/me/gifts/${encodeURIComponent(brandKey)}/opened`)

// ---- direct gifts (v1.7.4): a gift from the giver's OWN goal to a friend, not tied to any wish --------------------
const giftsBase = (friendId) => `/v1/users/${encodeURIComponent(friendId)}/gifts`
export const sendDirectGift = (friendId, { giftId, brandKey, message = '', banner = 'none', value = '' }) => request('POST', giftsBase(friendId), { giftId, brandKey, message, banner, value })
export const deliverDirectGift = (friendId, giftId, boxes) => request('POST', `${giftsBase(friendId)}/${encodeURIComponent(giftId)}/deliver`, { boxes })
export const sayThanksDirect = (giftId) => request('POST', `/v1/me/gifts/direct/${encodeURIComponent(giftId)}/thanks`)
export const markGiftOpenedDirect = (giftId) => request('POST', `/v1/me/gifts/direct/${encodeURIComponent(giftId)}/opened`)

// The same refusal rules as the Friends server (friends/src/rules.js cleanGiftMessage), run on the phone before sending
// so the giver sees why nothing was sent. Line breaks count as spaces. Returns an error reason ('link' | 'long') or null
// when the message is fine (empty is fine). The code must never be typed here, so a link-looking message is refused.
export function giftMessageError(text) {
  const s = String(text || '').replace(/[\r\n\t]+/g, ' ').trim()
  if (s === '') return null
  if ([...s].length > 140) return 'long'
  const low = s.toLowerCase()
  if (low.includes('http') || low.includes('www.') || /[a-z0-9]+\.[a-z]{2,24}\//i.test(s)) return 'link'
  return null
}

// The card value to send with a gift (v1.7.6), shown only to the receiver. A goal's itemDetail, but only when it is an
// amount in a currency the shop uses (same shape as the Friends server cleanGiftValue, friends/src/rules.js): "20 USD",
// "2.50 EUR". Plan cards (a duration like "1 Year" for Discord) and anything else send nothing ('').
const GIFT_VALUE_RE = /^\d{1,7}(\.\d{1,2})? (USD|EUR|GBP|NGN)$/
export const giftCardValue = (itemDetail) => { const s = String(itemDetail || '').trim(); return GIFT_VALUE_RE.test(s) ? s : '' }

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
    // A direct gift (v1.7.4) is not tied to a wish: there is no server claim to release, it survives a card change, and
    // it is dropped only when its goal is gone (deleting the goal drops the tag). No server call either way.
    if (tag.direct) {
      if (!g) { delete m[goalId]; changed = true }
      continue
    }
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
