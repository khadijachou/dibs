// Gift banners (lib/giftBanners.js): unlock-by-level, the unknown-id fallback, the rank-sheet mapping, and the
// one-time between-rank toast. Pure apart from the device store, which is a Map shim here (like looks.test.js).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}
const {
  FREE_BANNERS, LEVEL_BANNERS, LEVEL_BANNER_IDS, ALL_BANNER_IDS, BETWEEN_BANNERS,
  levelFor, isUnlocked, unlockedBanners, lineKey, bannerForRank, gbToAnnounce,
} = await import('./giftBanners.js')
const { RANKS } = await import('./xp.js')
beforeEach(() => mem.clear())

const KEY_RE = /^[a-z0-9_-]{1,32}$/ // the server's rule (friends/src/rules.js), so a gift carrying the id is accepted

test('eleven banner ids, all matching the server rule, four free and seven by level', () => {
  assert.equal(FREE_BANNERS.length, 4)
  assert.equal(LEVEL_BANNERS.length, 7)
  assert.equal(ALL_BANNER_IDS.length, 11)
  for (const id of ALL_BANNER_IDS) assert.ok(KEY_RE.test(id), id)
  assert.deepEqual(LEVEL_BANNER_IDS, ['love', 'saver', 'planner', 'gamer', 'collector', 'treasurer', 'legend'])
})

test('the level banners are in level order with the right unlock levels', () => {
  assert.deepEqual(LEVEL_BANNERS.map((b) => b.level), [3, 5, 10, 15, 20, 35, 50])
})

test('the five rank banners read their level from lib/xp.js RANKS (no second copy)', () => {
  for (const id of ['saver', 'planner', 'collector', 'treasurer', 'legend']) {
    const rank = RANKS.find((r) => r.id === id)
    assert.equal(levelFor(id), rank.level, id)
  }
  // love (3) and gamer (15) sit between ranks: their levels are not RANKS levels.
  assert.equal(BETWEEN_BANNERS.map((b) => b.id).sort().join(','), 'gamer,love')
  for (const b of BETWEEN_BANNERS) assert.ok(!RANKS.some((r) => r.level === b.level), b.id)
})

test('unlock by level: 2, 3, 4, 5, 14, 15, 50', () => {
  const ids = (lvl) => unlockedBanners(lvl).map((b) => b.id)
  assert.deepEqual(ids(2), [])
  assert.deepEqual(ids(3), ['love'])
  assert.deepEqual(ids(4), ['love'])
  assert.deepEqual(ids(5), ['love', 'saver'])
  assert.deepEqual(ids(14), ['love', 'saver', 'planner'])
  assert.deepEqual(ids(15), ['love', 'saver', 'planner', 'gamer'])
  assert.deepEqual(ids(50), ['love', 'saver', 'planner', 'gamer', 'collector', 'treasurer', 'legend'])
  assert.equal(isUnlocked('love', 2), false)
  assert.equal(isUnlocked('love', 3), true)
  assert.equal(isUnlocked('legend', 49), false)
  assert.equal(isUnlocked('legend', 50), true)
})

test('unknown id: Infinity level, never unlocked, no line key', () => {
  assert.equal(levelFor('nope'), Infinity)
  assert.equal(isUnlocked('nope', 9999), false)
  assert.equal(lineKey('nope'), null)
  assert.equal(lineKey(''), null)
  assert.equal(lineKey(undefined), null)
})

test('lineKey covers every free and level banner', () => {
  for (const id of FREE_BANNERS) assert.ok(lineKey(id), id)
  for (const id of LEVEL_BANNER_IDS) assert.ok(lineKey(id), id)
  assert.equal(lineKey('love'), 'gb_love')
  assert.equal(lineKey('birthday'), 'frd_banner_birthday')
})

test('bannerForRank: each rank id maps to its banner, starter has none', () => {
  assert.equal(bannerForRank('starter'), null)
  assert.equal(bannerForRank('saver').id, 'saver')
  assert.equal(bannerForRank('legend').level, 50)
  assert.equal(bannerForRank('nope'), null)
})

test('gbToAnnounce: first run seeds silently, then announces each between-rank banner once, lowest first', () => {
  // First run at level 1: seed with 0 (none reached), announce nothing.
  assert.equal(gbToAnnounce(1), null)
  // Reaching 3 then 15 across launches: love, then gamer, each once.
  assert.equal(gbToAnnounce(3).id, 'love')
  assert.equal(gbToAnnounce(3), null) // already announced
  assert.equal(gbToAnnounce(15).id, 'gamer')
  assert.equal(gbToAnnounce(15), null)
})

test('gbToAnnounce: a first run above a between-rank level never announces it retroactively', () => {
  mem.clear()
  assert.equal(gbToAnnounce(20), null) // seeds at 15 (highest between-rank reached): no toast for love or gamer
  assert.equal(gbToAnnounce(20), null)
})

test('gbToAnnounce: a jump past both announces the lowest first, the next on the following launch', () => {
  mem.clear()
  assert.equal(gbToAnnounce(1), null) // seed at 0
  assert.equal(gbToAnnounce(20).id, 'love') // crossed both love and gamer; love first
  assert.equal(gbToAnnounce(20).id, 'gamer') // next launch: gamer
  assert.equal(gbToAnnounce(20), null)
})
