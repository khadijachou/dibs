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
  assert.deepEqual(body.cards, [{ brandKey: 'amazon' }]) // cards are objects now (no value here, no faceValue)
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

// ---- v1.4.2: totals, avatar, card/goal values -----------------------------------------------------------------
const AVATAR = 'data:image/svg+xml;base64,PHN2Zy8+'
const giftGoal = (o) => ({ status: 'saving', brandKey: 'steam', faceValue: '20', currency: 'USD', targetNim: 100, deposits: [{ nim: 50 }], ...o })

test('totals: saved and earned when on, saved floored, earned omitted when unknown', () => {
  const v = { totals: 'friends' }
  assert.deepEqual(sharedPayload({ visibility: v, saved: 1234.9, earned: 56.7 }).totals, { saved: 1234, earned: 56 })
  assert.deepEqual(sharedPayload({ visibility: v, saved: 1234, earned: null }).totals, { saved: 1234 }) // unknown earned omitted, never 0
  assert.equal('totals' in sharedPayload({ visibility: {}, saved: 10, earned: 5 }), false) // off -> absent
})

test('avatar: only when on and a data URL', () => {
  assert.equal(sharedPayload({ visibility: { avatar: 'everyone' }, avatar: AVATAR }).avatar, AVATAR)
  assert.equal('avatar' in sharedPayload({ visibility: {}, avatar: AVATAR }), false)
  assert.equal('avatar' in sharedPayload({ visibility: { avatar: 'friends' }, avatar: 'http://x/a.png' }), false)
})

test('cards and goals carry the value, cards are not unique', () => {
  const body = sharedPayload({
    visibility: { cards: 'friends', goals: 'friends' },
    goals: [
      giftGoal({ status: 'redeemed', brandKey: 'steam' }),
      giftGoal({ status: 'redeemed', brandKey: 'steam' }), // a second identical bought card, kept
      giftGoal({ status: 'saving', brandKey: 'netflix', faceValue: '25', currency: 'EUR', deposits: [{ nim: 25 }] }),
      giftGoal({ status: 'saving', brandKey: 'apple', faceValue: null, currency: null }), // no value
    ],
  })
  assert.deepEqual(body.cards, [{ brandKey: 'steam', value: '20 USD' }, { brandKey: 'steam', value: '20 USD' }])
  assert.deepEqual(body.goals, [{ brandKey: 'netflix', pct: 25, value: '25 EUR' }, { brandKey: 'apple', pct: 50 }])
})

test('no payload field contains the wallet address', () => {
  const body = sharedPayload({ visibility: { avatar: 'friends', totals: 'friends', cards: 'friends', goals: 'friends' }, avatar: AVATAR, saved: 1, earned: 1, goals: [giftGoal({ status: 'redeemed' })] })
  const s = JSON.stringify(body)
  assert.ok(!s.includes('NQ'))
})

test('gift goals are excluded from both goals and cards (they stay a surprise)', () => {
  const body = sharedPayload({
    visibility: { cards: 'friends', goals: 'friends' },
    giftGoalIds: ['gift-saving', 'gift-bought'],
    goals: [
      goal({ id: 'mine', status: 'saving', brandKey: 'steam', targetNim: 100, deposits: [{ nim: 30 }] }),
      goal({ id: 'gift-saving', status: 'saving', brandKey: 'netflix', targetNim: 100, deposits: [{ nim: 60 }] }), // hidden
      goal({ id: 'own-card', status: 'redeemed', brandKey: 'amazon' }),
      goal({ id: 'gift-bought', status: 'redeemed', brandKey: 'apple' }), // hidden
    ],
  })
  assert.deepEqual(body.goals, [{ brandKey: 'steam', pct: 30 }])
  assert.deepEqual(body.cards, [{ brandKey: 'amazon' }])
})
