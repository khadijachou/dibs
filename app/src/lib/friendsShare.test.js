import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sharedPayload } from './friendsShare.js'

const allOn = { level: 'friends', badges: 'everyone', cards: 'friends', goals: 'friends', wishlist: 'everyone' }
const goal = (o) => ({ status: 'saving', brandKey: 'steam', targetNim: 100, deposits: [{ nim: 40 }], ...o })

test('every item on: the full body, pct rounded and capped', () => {
  const body = sharedPayload({
    visibility: allOn,
    xp: { level: 12, rank: 'planner' },
    badges: ['first', 'planted'],
    goals: [
      goal({ status: 'saving', brandKey: 'steam', targetNim: 100, deposits: [{ nim: 33 }] }), // 33%
      goal({ status: 'ready', brandKey: 'netflix', targetNim: 100, deposits: [{ nim: 250 }] }), // capped to 100
      goal({ status: 'redeemed', brandKey: 'amazon', targetNim: 100, deposits: [{ nim: 100 }] }), // card, not an active goal
    ],
    wishlist: ['steam', 'apple'],
  })
  assert.deepEqual(body.level, { level: 12, rank: 'planner' })
  assert.deepEqual(body.badges, ['first', 'planted'])
  assert.deepEqual(body.cards, ['amazon'])
  assert.deepEqual(body.goals, [{ brandKey: 'steam', pct: 33 }, { brandKey: 'netflix', pct: 100 }])
  assert.deepEqual(body.wishlist, ['steam', 'apple'])
})

test('off items: the key is absent, not an empty value', () => {
  const body = sharedPayload({
    visibility: { level: 'off', badges: 'off', cards: 'off', goals: 'off', wishlist: 'off' },
    xp: { level: 5, rank: 'saver' }, badges: ['first'], goals: [goal({ status: 'redeemed', brandKey: 'amazon' })], wishlist: ['steam'],
  })
  assert.deepEqual(body, {})
  for (const k of ['level', 'badges', 'cards', 'goals', 'wishlist']) assert.equal(k in body, false)
})

test('an on item with no data is present but empty', () => {
  const body = sharedPayload({ visibility: { badges: 'friends' }, badges: [] })
  assert.equal('badges' in body, true)
  assert.deepEqual(body.badges, [])
})

test('limits: 60 badges, 60 cards, 12 goals, 60 wishlist', () => {
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i))
  const body = sharedPayload({
    visibility: allOn,
    badges: many(80, (i) => 'b' + i),
    goals: [...many(70, (i) => goal({ status: 'redeemed', brandKey: 'card' + i })), ...many(20, (i) => goal({ status: 'saving', brandKey: 'open' + i }))],
    wishlist: many(80, (i) => 'w' + i),
  })
  assert.equal(body.badges.length, 60)
  assert.equal(body.cards.length, 60)
  assert.equal(body.goals.length, 12)
  assert.equal(body.wishlist.length, 60)
})

test('a goal with no brand key is skipped', () => {
  const body = sharedPayload({
    visibility: { goals: 'friends', cards: 'friends' },
    goals: [goal({ brandKey: null }), goal({ brandKey: 'steam' }), { status: 'redeemed', brandKey: null, deposits: [], targetNim: 1 }],
  })
  assert.deepEqual(body.goals, [{ brandKey: 'steam', pct: 40 }])
  assert.deepEqual(body.cards, [])
})

test('level needs a valid level and rank', () => {
  assert.equal('level' in sharedPayload({ visibility: { level: 'friends' }, xp: { level: 0, rank: 'saver' } }), false)
  assert.equal('level' in sharedPayload({ visibility: { level: 'friends' }, xp: { level: 5, rank: 'Bad Rank' } }), false)
  assert.deepEqual(sharedPayload({ visibility: { level: 'friends' }, xp: { level: 5, rank: 'saver' } }).level, { level: 5, rank: 'saver' })
})
