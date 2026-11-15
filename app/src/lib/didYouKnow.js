// "Did you know?" picker. Pure: no browser imports, so `npm test` runs it. One fact per visit of a screen,
// no timer, no rotation. The position is an index into the fact list (dyk_u1.. / dyk_c1..), so it is the same
// across languages. Nothing is sent anywhere; the only saved data is the position, on the phone.
//
// Two independent lists: 'U' (the unlock wait, DYK_U_COUNT facts) and 'C' (the code on its way, DYK_C_COUNT).
// The component and the tests share these counts. Keep them in step with the dyk_u*/dyk_c* keys in lib/i18n.js
// (lib/didYouKnowFacts.test.js checks that they match).
export const DYK_U_COUNT = 20
export const DYK_C_COUNT = 27

const KEY = (list) => `dibs.dyk.${list}`

function defaultStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

const randInt = (count, random) => Math.min(count - 1, Math.max(0, Math.floor(random() * count)))

// A fresh shuffle of 0..count-1. When count > 1 and `avoid` is a real index, the shuffle never starts with it
// (so a new pass never opens on the fact just shown).
function shuffle(count, random, avoid) {
  const a = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  if (count > 1 && avoid >= 0 && avoid < count && a[0] === avoid) {
    const k = 1 + Math.floor(random() * (count - 1))
    const t = a[0]; a[0] = a[k]; a[k] = t
  }
  return a
}

// Index (0-based) of the fact to show for this visit of list 'U' or 'C'.
// Storage key dibs.dyk.<list> = { order: [indexes], next: n }: returns order[next] and saves next + 1.
// When the order is used up, missing, unreadable, or its length differs from count: make a new shuffle and start at 0.
// Storage missing, blocked or throwing: return a random index and save nothing. Never throws.
export function nextFact(list, count, opts = {}) {
  const random = opts.random || Math.random
  if (!(count > 0)) return 0
  const storage = opts.storage !== undefined ? opts.storage : defaultStorage()
  if (!storage) return randInt(count, random)
  try {
    const key = KEY(list)
    let order = null
    let next = 0
    const raw = storage.getItem(key)
    if (raw) {
      try {
        const o = JSON.parse(raw)
        if (o && Array.isArray(o.order) && Number.isInteger(o.next)) { order = o.order; next = o.next }
      } catch { /* unreadable: reshuffle below */ }
    }
    const valid = Array.isArray(order) && order.length === count && next >= 0 && next < order.length
    if (!valid) {
      const last = Array.isArray(order) && order.length && next > 0 && next <= order.length ? order[next - 1] : -1
      order = shuffle(count, random, last)
      next = 0
    }
    const idx = order[next]
    storage.setItem(key, JSON.stringify({ order, next: next + 1 }))
    return idx
  } catch {
    // Blocked or throwing storage: show something, save nothing.
    return randInt(count, random)
  }
}
