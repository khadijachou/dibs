// v1.2.9: one-time move of the goal ledger into a single key. Nimiq Pay rotates the funded address, which once left
// copies of the same goal under six dibs.goals.<address> keys on one phone. This merges them once into dibs.goals
// (lib/goals.js now reads and writes only that key) and marks the move with dibs.goalsMoved, so it runs once.
//
// mergeGoalLists is pure (the core); moveGoalsOnce is the thin storage wrapper. The merge reuses the exact rules the
// launch used before this release (lib/goals.adoptGoals), ported to run on in-memory lists: newerCopy for the same id
// under several keys, deleted ids dropped, no second open goal for the same card, an empty copy giving way to a funded
// one. The old dibs.goals.<address> keys are never written, changed or deleted here.
import { deletable, newerCopy, openGoalFor, savedNim } from './goals.js'

// lists: [{ address, goals }] read from every dibs.goals.<address> key (and dibs.goals if it somehow already exists).
// deleted: the Set of ids the device remembers deleting. current: the address today's launch would use (the funded
// one); its list is the base, exactly as adoptGoals treated read(address). Returns the merged goals, newest first.
export function mergeGoalLists({ lists = [], deleted = new Set(), current } = {}) {
  const gone = deleted instanceof Set ? deleted : new Set(deleted || [])
  const mineEntry = lists.find((l) => l && l.address === current)
  const mine = Array.isArray(mineEntry?.goals) ? mineEntry.goals : []
  const others = lists.filter((l) => l && l !== mineEntry)

  const ids = new Set(mine.map((g) => g.id))
  const best = new Map() // id -> the best copy saved under another key
  for (const l of others) {
    const goals = Array.isArray(l.goals) ? l.goals : []
    for (const g of goals) {
      if (!g || !g.id) continue
      const cur = best.get(g.id)
      if (!cur || newerCopy(g, cur)) best.set(g.id, g)
    }
  }
  const extra = [...best.values()].filter((g) => !ids.has(g.id))
  for (const g of extra) ids.add(g.id)

  // A goal saved here too: another key's copy replaces it only when that copy is the right one.
  let all = mine.filter((g) => !gone.has(g.id)).map((g) => {
    const other = best.get(g.id)
    return other && newerCopy(other, g) ? other : g
  })
  for (const g of extra) {
    if (gone.has(g.id)) continue
    const open = g.status !== 'redeemed' && g.status !== 'withdrawn'
    const twin = open ? openGoalFor(all, g.itemId) : null
    if (twin && savedNim(g) === 0 && deletable(g)) continue // empty copy: link to the open goal
    if (twin && savedNim(twin) === 0 && deletable(twin)) all = all.filter((x) => x.id !== twin.id) // funded one wins
    all.push(g)
  }
  return all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

const MOVED = 'dibs.goalsMoved'
const MAIN = 'dibs.goals'
const readJSON = (storage, k) => { try { return JSON.parse(storage.getItem(k)) } catch { return null } }

// Runs once at launch. Never throws: if storage throws, the app goes on as today and tries again next launch.
export function moveGoalsOnce(storage, current, now) {
  try {
    if (storage.getItem(MOVED)) return // already moved
    const lists = []
    let keys = []
    try { keys = Object.keys(storage).filter((k) => k.startsWith('dibs.goals.')) } catch { keys = [] }
    for (const k of keys) {
      const goals = readJSON(storage, k)
      if (Array.isArray(goals)) lists.push({ address: k.slice('dibs.goals.'.length), goals })
    }
    // Should not happen (dibs.goals with no marker): keep it as the base and merge the old keys into it.
    const existing = readJSON(storage, MAIN)
    const merged = Array.isArray(existing)
      ? mergeGoalLists({ lists: [{ address: current, goals: existing }, ...lists], deleted: deletedSet(storage), current })
      : mergeGoalLists({ lists, deleted: deletedSet(storage), current })
    storage.setItem(MAIN, JSON.stringify(merged))
    storage.setItem(MOVED, new Date(now).toISOString())
  } catch { /* storage blocked: try again next launch */ }
}

function deletedSet(storage) {
  const d = readJSON(storage, 'dibs.deleted')
  return new Set(Array.isArray(d) ? d : [])
}
