// The wishlist: brand keys the user hearted, kept on this phone only (dibs.wishlist, an array of brand keys).
// It works with Friends off and with no Friends server. It reaches the Friends server only through the existing
// sync in lib/friends.js, and only when the user set Wishlist to Friends or Everyone.
const KEY = 'dibs.wishlist'
export const WISHLIST_EVENT = 'dibs:wishlist'
export const WISHLIST_MAX = 60

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(v) ? v.filter((k) => typeof k === 'string') : []
  } catch { return [] }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(WISHLIST_EVENT)) } catch { /* no window */ }
}

export const getWishlist = () => read()
export const has = (key) => read().includes(key)

// Adds or removes a brand key. Capped at WISHLIST_MAX (a new key beyond the cap is not added). Returns the new list.
export function toggle(key) {
  if (typeof key !== 'string' || !key) return read()
  const list = read()
  if (list.includes(key)) { const next = list.filter((k) => k !== key); write(next); return next }
  if (list.length >= WISHLIST_MAX) return list // full: nothing added, nothing changed
  const next = [...list, key]
  write(next)
  return next
}

export const subscribe = (cb) => {
  try { window.addEventListener(WISHLIST_EVENT, cb); return () => window.removeEventListener(WISHLIST_EVENT, cb) } catch { return () => {} }
}
