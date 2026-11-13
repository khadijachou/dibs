// Important news the user has not opened yet (display only, this device only).
//   dibs.newsSeen   the version of the newest release the user has opened (a NEWS v, like "1.1.1")
// unreadNews() gives the newest NEWS entry marked big that is newer than the saved version (by its place in NEWS, not
// by comparing strings), or null. No saved value (or one not in NEWS) counts as nothing seen for a user who finished
// onboarding; a new user gets the newest version saved when onboarding ends (markNewsSeen), so no dot on arrival.
// Storage that fails gives null. Nothing here throws.
import { useSyncExternalStore } from 'react'
import { NEWS } from './news.js'

export const NEWS_SEEN_KEY = 'dibs.newsSeen'
export const NEWS_EVENT = 'dibs:news'

const norm = (v) => String(v ?? '').trim().replace(/^v/i, '').replace(/^(\d+\.\d+)\.0$/, '$1') // "1.1.0" -> "1.1"
const local = () => { try { return globalThis.localStorage ?? null } catch { return null } }

export function unreadNews({ list = NEWS, storage = local() } = {}) {
  try {
    if (!storage) return null
    const saved = storage.getItem(NEWS_SEEN_KEY)
    let seen = saved == null ? -1 : list.findIndex((n) => n.v && norm(n.v) === norm(saved))
    if (seen < 0) {
      if (storage.getItem('dibs.onboarded') !== '1') return null
      seen = list.length // nothing seen yet
    }
    return list.slice(0, seen).find((n) => n.big) || null
  } catch {
    return null
  }
}

export function markNewsSeen({ list = NEWS, storage = local() } = {}) {
  try {
    const newest = list.find((n) => n.v)
    if (storage && newest) storage.setItem(NEWS_SEEN_KEY, newest.v)
  } catch { /* private mode */ }
  try { if (typeof window !== 'undefined') window.dispatchEvent(new Event(NEWS_EVENT)) } catch { /* no window */ }
}

const subscribe = (cb) => {
  window.addEventListener(NEWS_EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(NEWS_EVENT, cb); window.removeEventListener('storage', cb) }
}
const snapshot = () => unreadNews()

// The unread entry (or null), updated when markNewsSeen runs anywhere in the app or in another tab.
export const useUnreadNews = () => useSyncExternalStore(subscribe, snapshot, () => null)
