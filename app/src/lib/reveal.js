// Gift reveal (v1.7.2): the full-screen reveal the RECEIVER gets for a gift a friend marked as sent (a gift carried by
// GET /v1/me .gifts, see friends/src/index.js giftsReceived). Pure logic plus one "seen" pointer on this phone. One
// reveal per launch, oldest first; once dismissed (Later, the x, or Say thanks) the gift is marked seen so it never
// reopens, while its Wishlist card stays. Looks only: nothing here pays NIM, sends, or carries a code or an address.
//   dibs.revealSeen   a list of "<from id>:<brandKey>", the gifts already revealed on this phone
const KEY = 'dibs.revealSeen'

const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : [] } catch { return [] } }
const write = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(-300))) } catch { /* private mode */ } }

// The per-gift key: for a wishlist gift the giver id and the brand (the pair the server keys a claim by); for a direct
// gift (v1.7.4) "d:<giftId>", so two direct gifts of the same brand both reveal. Never a code or an address.
export const revealKey = (g) => (g?.kind === 'direct' ? (g.giftId ? `d:${g.giftId}` : '') : `${g?.from?.id || ''}:${g?.brandKey || ''}`)
export const revealSeen = () => read()

// A gift that can be revealed: a giver id, and its identity (a giftId for a direct gift, a brand for a wishlist gift).
const revealable = (g) => Boolean(g && g.from?.id && (g.kind === 'direct' ? g.giftId : g.brandKey))

// The next gift to reveal: the first in the list (server order, oldest first) that is not yet seen on this phone, or null.
// A malformed entry is skipped, never shown.
export function nextReveal(gifts, seen = read()) {
  if (!Array.isArray(gifts)) return null
  const s = new Set(seen)
  return gifts.find((g) => revealable(g) && !s.has(revealKey(g))) || null
}

// Mark one gift revealed on this phone (idempotent). A malformed gift is ignored.
export function markRevealSeen(g) {
  if (!revealable(g)) return
  const k = revealKey(g)
  const l = read()
  if (!l.includes(k)) write([...l, k])
}
