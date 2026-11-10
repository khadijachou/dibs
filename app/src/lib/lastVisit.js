// Earned since the last visit (Welcome back, line 3). On this device only.
//
// dibs.lastEarned = { value, at }: the staking earned figure the last time the app read it.
// prev is read once, before the first write of this launch (initLastVisit at app start, or lazily on first use),
// and kept in memory: every later read of the earned figure (App.jsx runBadgeCheck) overwrites the stored value.
const KEY = 'dibs.lastEarned'

let loaded = false
let prev = null
let current = null
let waiters = []

function load() {
  if (loaded) return
  loaded = true
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    prev = v && Number.isFinite(Number(v.value)) ? { value: Number(v.value), at: Number(v.at) || null } : null
  } catch { prev = null }
}

export const initLastVisit = () => load()
export const previousEarned = () => { load(); return prev }

// Called each time the app reads the earned figure from the chain.
export function recordEarned(value) {
  const v = Number(value)
  if (value == null || !Number.isFinite(v)) return
  load()
  current = v
  try { localStorage.setItem(KEY, JSON.stringify({ value: v, at: Date.now() })) } catch { /* private mode */ }
  const ws = waiters
  waiters = []
  ws.forEach((fn) => fn(v))
}

// The figure read during this launch; waits at most timeoutMs for the first read, then null. Never rejects.
export function currentEarned(timeoutMs = 1200) {
  if (current != null) return Promise.resolve(current)
  return new Promise((resolve) => {
    const fn = (v) => { clearTimeout(id); resolve(v) }
    const id = setTimeout(() => { waiters = waiters.filter((w) => w !== fn); resolve(null) }, timeoutMs)
    waiters.push(fn)
  })
}

// Test helper: forget what this module read (a new launch).
export function _resetLastVisit() { loaded = false; prev = null; current = null; waiters = [] }
