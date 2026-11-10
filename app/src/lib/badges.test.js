import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const { BADGES, check, evaluate, getBadges, setShared, CYCLE3_END } = await import('./badges.js')

const DAY = 864e5
const NOW = Date.parse('2026-11-10T12:00:00Z')
const AFTER = Date.parse('2026-12-01T00:00:00Z')
const iso = (ms) => new Date(ms).toISOString()
let n = 0
const goal = (over = {}) => ({
  id: `g${++n}`, itemId: 'steam-20', itemName: 'Steam gift card', itemDetail: '20 USD', brandKey: 'steam', targetNim: 1000,
  createdAt: iso(NOW - 10 * DAY), deadline: iso(NOW + 60 * DAY), deposits: [], unlockSteps: [], status: 'saving', payment: null, ...over,
})
const dep = (nim, at, extra = {}) => ({ nim, at: iso(at), tx: 'tx' + nim, ...extra })
const ids = (r) => r.map((x) => x.id).sort()
const has = (args, id) => evaluate({ now: AFTER, ...args }).some((x) => x.id === id)

beforeEach(() => store.clear())

test('21 badges in four groups', () => {
  assert.equal(BADGES.length, 21)
  assert.equal(new Set(BADGES.map((b) => b.id)).size, 21)
})

test('nothing at all: only Cycle III, and only before 1 Dec', () => {
  assert.deepEqual(ids(evaluate({ goals: [], now: NOW })), ['cycle3'])
  assert.deepEqual(ids(evaluate({ goals: [], now: AFTER })), [])
  assert.ok(has({ now: CYCLE3_END - 1 }, 'cycle3'))
  assert.ok(!has({ now: CYCLE3_END }, 'cycle3'))
})

test('first, planted (moves do not count), with goalId', () => {
  const g = goal()
  assert.deepEqual(evaluate({ goals: [g], now: AFTER }), [{ id: 'first', goalId: g.id }])
  const moved = goal({ deposits: [dep(50, NOW, { kind: 'move' })] })
  assert.ok(!has({ goals: [moved] }, 'planted'))
  const real = goal({ deposits: [dep(100, NOW)] })
  assert.deepEqual(evaluate({ goals: [real], now: AFTER }).find((x) => x.id === 'planted'), { id: 'planted', goalId: real.id })
})

test('growing, sprout, orchard, forest from earned NIM; null counts as 0', () => {
  assert.ok(!has({ earnedNim: null }, 'growing'))
  assert.ok(has({ earnedNim: 0.01 }, 'growing'))
  assert.ok(!has({ earnedNim: 9.99 }, 'sprout'))
  assert.ok(has({ earnedNim: 10 }, 'sprout'))
  assert.ok(has({ earnedNim: 100 }, 'orchard') && !has({ earnedNim: 99 }, 'orchard'))
  assert.ok(has({ earnedNim: 1000 }, 'forest') && !has({ earnedNim: 999 }, 'forest'))
})

test('halfway at 50 %', () => {
  assert.ok(!has({ goals: [goal({ deposits: [dep(499, NOW)] })] }, 'halfway'))
  assert.ok(has({ goals: [goal({ deposits: [dep(500, NOW)] })] }, 'halfway'))
})

test('patient: ready, or bought after an unlock', () => {
  assert.ok(has({ goals: [goal({ status: 'ready' })] }, 'patient'))
  assert.ok(!has({ goals: [goal({ status: 'redeemed' })] }, 'patient'))
  assert.ok(has({ goals: [goal({ status: 'redeemed', unlockSteps: [{ step: 'remove' }] })] }, 'patient'))
  assert.ok(!has({ goals: [goal({ status: 'unlocking' })] }, 'patient'))
})

test('dibs and the category badges from redeemed goals; fullset needs all five', () => {
  assert.ok(!has({ goals: [goal({ brandKey: 'steam' })] }, 'player'))
  const r = (brandKey) => goal({ status: 'redeemed', brandKey })
  assert.ok(has({ goals: [r('steam')] }, 'dibs'))
  assert.ok(has({ goals: [r('steam')] }, 'player'))
  assert.ok(has({ goals: [r('airbnb')] }, 'globe'))
  assert.ok(has({ goals: [r('netflix')] }, 'movie'))
  assert.ok(has({ goals: [r('ubereats')] }, 'foodie'))
  assert.ok(has({ goals: [r('amazon')] }, 'unboxed'))
  assert.ok(has({ goals: [r('somethingnew')] }, 'unboxed')) // unknown brand counts as shopping
  const four = [r('steam'), r('airbnb'), r('netflix'), r('ubereats')]
  assert.ok(!has({ goals: four }, 'fullset'))
  assert.ok(has({ goals: [...four, r('amazon')] }, 'fullset'))
})

test('ahead: 100 % reached on or before the deadline', () => {
  const deadline = NOW + 5 * DAY
  assert.ok(has({ goals: [goal({ deadline: iso(deadline), deposits: [dep(600, NOW - DAY), dep(400, deadline)] })] }, 'ahead'))
  assert.ok(!has({ goals: [goal({ deadline: iso(deadline), deposits: [dep(600, NOW - DAY), dep(400, deadline + 1)] })] }, 'ahead'))
  assert.ok(!has({ goals: [goal({ deposits: [dep(900, NOW)] })] }, 'ahead'))
})

test('comeback: a gap of more than 8 days, and on track now', () => {
  const start = NOW - 21 * DAY
  // 3 weeks into a 10-week plan of 100 NIM a week: 300 due by the end of week 3.
  const base = { createdAt: iso(start), deadline: iso(start + 70 * DAY) }
  const caughtUp = goal({ ...base, deposits: [dep(100, start + DAY), dep(200, start + 15 * DAY)] })
  assert.ok(has({ goals: [caughtUp], now: NOW }, 'comeback'))
  const noGap = goal({ ...base, deposits: [dep(100, start + DAY), dep(200, start + 8 * DAY)] })
  assert.ok(!has({ goals: [noGap], now: NOW }, 'comeback'))
  const stillBehind = goal({ ...base, deposits: [dep(50, start + DAY), dep(50, start + 15 * DAY)] })
  assert.ok(!has({ goals: [stillBehind], now: NOW }, 'comeback'))
})

test('juggler: 3 open goals; rebalancer: a move', () => {
  assert.ok(!has({ goals: [goal(), goal(), goal({ status: 'redeemed' })] }, 'juggler'))
  assert.ok(has({ goals: [goal(), goal(), goal({ status: 'unlocking' })] }, 'juggler'))
  assert.ok(has({ goals: [goal({ deposits: [dep(-20, NOW, { kind: 'move' })] })] }, 'rebalancer'))
  assert.ok(!has({ goals: [goal({ deposits: [dep(100, NOW)] })] }, 'rebalancer'))
})

test('spread: the share flag', () => {
  assert.ok(!has({ shared: false }, 'spread'))
  assert.ok(has({ shared: true }, 'spread'))
})

test('the first check records what is met without announcing it', async () => {
  const g = goal({ deposits: [dep(100, NOW)] })
  assert.deepEqual(await check({ goals: [g], now: NOW }), [])
  assert.deepEqual(Object.keys(getBadges()).sort(), ['cycle3', 'first', 'planted'])
  assert.equal(getBadges().first.goalId, g.id)
  assert.deepEqual(await check({ goals: [g], now: NOW }), [])
})

test('later checks announce new badges once', async () => {
  await check({ goals: [], now: NOW })
  assert.deepEqual(Object.keys(getBadges()), ['cycle3'])
  const g = goal()
  assert.deepEqual(await check({ goals: [g], now: NOW }), ['first'])
  assert.deepEqual(await check({ goals: [g], now: NOW }), [])
  setShared()
  assert.deepEqual(await check({ goals: [g], now: NOW }), ['spread'])
})

test('a recorded badge is never removed, even when its goal is deleted or Cycle III ends', async () => {
  await check({ goals: [], now: NOW })
  await check({ goals: [goal({ deposits: [dep(-5, NOW, { kind: 'move' })] })], now: NOW })
  assert.ok(getBadges().rebalancer)
  assert.deepEqual(await check({ goals: [], now: AFTER }), [])
  assert.deepEqual(Object.keys(getBadges()).sort(), ['cycle3', 'first', 'rebalancer'])
})

test('cycle3 is not recorded after 1 Dec on a new phone', async () => {
  await check({ goals: [], now: AFTER })
  assert.deepEqual(getBadges(), {})
  await check({ goals: [], now: NOW }) // the clock went back: it holds again, and is announced
  assert.ok(getBadges().cycle3)
})

test('Spread the word counts a real share only', async () => {
  const { shareEarns } = await import('./badges.js')
  assert.equal(shareEarns('shared'), true)
  assert.equal(shareEarns('fallback'), true)
  assert.equal(shareEarns('cancelled'), false)
  assert.equal(shareEarns('failed'), false)
  assert.equal(shareEarns(undefined), false)
})
