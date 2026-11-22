// Rank unlocks (lib/looks.js): what each rank unlocks, the fall-back for a locked or unknown id, reset, and the
// rank-reached detection. Pure apart from the device store, which is a Map shim here (like seen.test.js).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}
const {
  ACCENTS, FRAMES, RINGS, KINDS, KIND_IDS, DEFAULTS, isUnlocked, unlocked, levelFor,
  getLook, setLook, resetLook, isDefaultLook, getRankSeen, markRankSeen, rankToAnnounce, accentChoice,
} = await import('./looks.js')
beforeEach(() => mem.clear())

const ID_RE = /^[a-z0-9_-]{1,16}$/ // the server's rule (friends/src/rules.js LOOK_RE)

test('every look id is short and matches the server rule', () => {
  for (const kind of KIND_IDS) for (const e of KINDS[kind]) assert.ok(ID_RE.test(e.id), `${kind} ${e.id}`)
})

test('frame and ring have six entries one per rank; accent has seven (Collector unlocks Cream and Citrus)', () => {
  for (const kind of KIND_IDS) assert.equal(KINDS[kind][0].id, DEFAULTS[kind], `${kind} default`)
  for (const kind of ['frame', 'ring']) {
    assert.equal(KINDS[kind].length, 6, kind)
    assert.deepEqual(KINDS[kind].map((e) => e.rank), ['starter', 'saver', 'planner', 'collector', 'treasurer', 'legend'], kind)
  }
  assert.equal(KINDS.accent.length, 7)
  assert.deepEqual(KINDS.accent.map((e) => e.rank), ['starter', 'saver', 'planner', 'collector', 'collector', 'treasurer', 'legend'])
})

test('the accent, frame and ring ids are the ones the spec names', () => {
  assert.deepEqual(ACCENTS.map((e) => e.id), ['coral', 'mint', 'butter', 'cream', 'citrus', 'gold', 'sunset'])
  assert.deepEqual(FRAMES.map((e) => e.id), ['none', 'saver', 'planner', 'collector', 'treasurer', 'legend'])
  assert.deepEqual(RINGS.map((e) => e.id), ['solid', 'steps', 'glow', 'dots', 'gold', 'sunset'])
})

test('levelFor maps each entry to its rank level, Infinity for unknown', () => {
  assert.equal(levelFor('accent', 'coral'), 1)
  assert.equal(levelFor('accent', 'mint'), 5)
  assert.equal(levelFor('ring', 'gold'), 35)
  assert.equal(levelFor('frame', 'legend'), 50)
  assert.equal(levelFor('accent', 'nope'), Infinity)
  assert.equal(levelFor('bogus', 'coral'), Infinity)
})

test('what each rank level unlocks', () => {
  // Level 1 (Starter): only the defaults.
  assert.deepEqual(unlocked(1), { accent: ['coral'], frame: ['none'], ring: ['solid'] })
  // Level 5 (Saver): two of each.
  assert.deepEqual(unlocked(5).accent, ['coral', 'mint'])
  assert.deepEqual(unlocked(5).ring, ['solid', 'steps'])
  // Level 12 (Planner, three ranks reached).
  assert.deepEqual(unlocked(12).frame, ['none', 'saver', 'planner'])
  // Level 20 (Collector): the accent list gains both Cream and Citrus.
  assert.deepEqual(unlocked(20).accent, ['coral', 'mint', 'butter', 'cream', 'citrus'])
  // Level 50 (Legend): all six frames and rings, and all seven accents.
  for (const kind of ['frame', 'ring']) assert.equal(unlocked(50)[kind].length, 6, kind)
  assert.equal(unlocked(50).accent.length, 7)
})

test('isUnlocked respects the level, rejects unknown kinds and ids', () => {
  assert.equal(isUnlocked('accent', 'mint', 4), false)
  assert.equal(isUnlocked('accent', 'mint', 5), true)
  assert.equal(isUnlocked('ring', 'sunset', 49), false)
  assert.equal(isUnlocked('ring', 'sunset', 50), true)
  assert.equal(isUnlocked('accent', 'coral', 1), true)
  assert.equal(isUnlocked('frame', 'nope', 99), false)
  assert.equal(isUnlocked('bogus', 'coral', 99), false)
})

test('getLook returns the defaults when nothing is stored', () => {
  assert.deepEqual(getLook(50), { accent: 'coral', frame: 'none', ring: 'solid' })
  assert.ok(isDefaultLook(50))
})

test('getLook keeps an unlocked choice, falls back when it is locked or unknown', () => {
  localStorage.setItem('dibs.look', JSON.stringify({ accent: 'gold', frame: 'legend', ring: 'dots' }))
  // At level 50 all are unlocked and kept.
  assert.deepEqual(getLook(50), { accent: 'gold', frame: 'legend', ring: 'dots' })
  // At level 12 gold (35) and legend (50) are locked -> default; dots (20) is locked at 12 too -> default.
  assert.deepEqual(getLook(12), { accent: 'coral', frame: 'none', ring: 'solid' })
  // At level 20 dots (20) is unlocked, gold and legend are not.
  assert.deepEqual(getLook(20), { accent: 'coral', frame: 'none', ring: 'dots' })
})

test('getLook replaces an unknown id with the default', () => {
  localStorage.setItem('dibs.look', JSON.stringify({ accent: 'rainbow', frame: 12, ring: 'steps' }))
  assert.deepEqual(getLook(50), { accent: 'coral', frame: 'none', ring: 'steps' })
})

test('setLook equips an unlocked look and ignores a locked or unknown one', () => {
  setLook('accent', 'mint', 5)
  assert.equal(getLook(50).accent, 'mint')
  // Locked at this level: ignored.
  setLook('ring', 'gold', 10)
  assert.equal(getLook(50).ring, 'solid')
  // Unknown id: ignored.
  setLook('frame', 'sparkle', 50)
  assert.equal(getLook(50).frame, 'none')
})

test('setLook preserves rankSeen', () => {
  markRankSeen('saver')
  setLook('accent', 'mint', 5)
  assert.equal(getRankSeen(), 'saver')
})

test('resetLook returns to the defaults but keeps rankSeen', () => {
  markRankSeen('planner')
  setLook('accent', 'gold', 50)
  setLook('ring', 'sunset', 50)
  resetLook()
  assert.deepEqual(getLook(50), { accent: 'coral', frame: 'none', ring: 'solid' })
  assert.equal(getRankSeen(), 'planner')
})

test('rankToAnnounce: first run stores silently, then announces a higher rank once-detected', () => {
  // First run with a high rank: nothing announced, the rank is stored.
  assert.equal(rankToAnnounce('planner'), null)
  assert.equal(getRankSeen(), 'planner')
  // Same rank: nothing.
  assert.equal(rankToAnnounce('planner'), null)
  // A higher rank is announced (closing the sheet is what marks it, so it keeps returning until then).
  assert.equal(rankToAnnounce('treasurer'), 'treasurer')
  assert.equal(rankToAnnounce('treasurer'), 'treasurer')
  // A lower rank is never announced (rank never goes down).
  markRankSeen('legend')
  assert.equal(rankToAnnounce('treasurer'), null)
})

test('accentChoice tells "never chose" (null) from "chose Coral" ("coral"), so only a picked accent colours the name', () => {
  // Never chose: nothing stored for accent, getLook still resolves the default coral for swatches.
  assert.equal(accentChoice(50), null)
  assert.equal(getLook(50).accent, 'coral')
  // Chose Coral explicitly: accentChoice returns 'coral', so the name takes the coral colour.
  setLook('accent', 'coral', 50)
  assert.equal(accentChoice(50), 'coral')
  // Chose a higher accent, but the level no longer unlocks it: treated as not chosen (normal colour), like getLook.
  setLook('accent', 'gold', 50)
  assert.equal(accentChoice(50), 'gold')
  assert.equal(accentChoice(1), null) // gold is locked at level 1
  // Reset goes back to never-chose.
  resetLook()
  assert.equal(accentChoice(50), null)
})
