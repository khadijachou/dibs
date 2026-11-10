import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}
const { burstSeen, initBurst, levelBandToAnnounce, levelToPlay, markBadges, markBurst, newBadges, setLevelSeen } = await import('./seen.js')
beforeEach(() => mem.clear())

const full = (g) => g.pct >= 1

test('burst: first run marks goals already at 100 % as seen; a new one bursts once', () => {
  assert.equal(burstSeen('a'), true) // before init: never celebrate by mistake
  initBurst([{ id: 'old', pct: 1 }, { id: 'a', pct: 0.92 }], full)
  assert.equal(burstSeen('old'), true)
  assert.equal(burstSeen('a'), false)
  markBurst('a')
  assert.equal(burstSeen('a'), true)
  initBurst([{ id: 'b', pct: 1 }], full) // already initialised: no change
  assert.equal(burstSeen('b'), false)
})

test('badges: first run marks every earned badge seen; new ids are detected until marked', () => {
  assert.deepEqual(newBadges(['first', 'saver']), [])
  assert.deepEqual(newBadges(['first', 'saver']), [])
  assert.deepEqual(newBadges(['first', 'saver', 'streak']), ['streak'])
  assert.deepEqual(newBadges(['first', 'saver', 'streak']), ['streak']) // pure read: StrictMode renders agree
  markBadges(['streak'])
  assert.deepEqual(newBadges(['first', 'saver', 'streak']), [])
})

test('level card: first run stores the level silently; a higher level plays once it is stored', () => {
  assert.equal(levelToPlay(3, 40), null)
  assert.equal(levelToPlay(3, 80), null)
  assert.deepEqual(levelToPlay(4, 10), { from: 3, into: 40 })
  setLevelSeen(4, 10)
  assert.equal(levelToPlay(4, 30), null)
  assert.deepEqual(JSON.parse(mem.get('dibs.seen.level')), { level: 4, into: 10 })
  mem.set('dibs.seen.level', '2') // a plain number
  assert.deepEqual(levelToPlay(4, 0), { from: 2, into: 0 })
})

test('level band: first run silent, then each new level once', () => {
  assert.equal(levelBandToAnnounce(5), null)
  assert.equal(levelBandToAnnounce(5), null)
  assert.equal(levelBandToAnnounce(7), 7)
  assert.equal(levelBandToAnnounce(7), null)
  assert.equal(mem.get('dibs.seen.levelBand'), '7')
})
