import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { giftOf, giftGoalIds, setGift, markSent, setThanked, clearGift, clearAll, reconcile, newGiftId, giftInKeyOf } from './gifts.js'

function fakeStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }
}
beforeEach(() => { globalThis.localStorage = fakeStorage() })
const KEY = 'dibs.friends.gifts'

test('setGift / giftOf / giftGoalIds round-trip', () => {
  assert.equal(giftOf('g1'), null)
  setGift('g1', { friendId: 'f1', name: 'Bob', brandKey: 'steam', state: 'claimed' })
  assert.deepEqual(giftOf('g1'), { friendId: 'f1', name: 'Bob', brandKey: 'steam', state: 'claimed' })
  assert.deepEqual(giftGoalIds(), ['g1'])
})

test('markSent, setThanked and clearGift', () => {
  setGift('g1', { friendId: 'f1', name: 'Bob', brandKey: 'steam', state: 'claimed' })
  markSent('g1')
  assert.equal(giftOf('g1').state, 'sent')
  setThanked('g1')
  assert.equal(giftOf('g1').thanked, true)
  clearGift('g1')
  assert.equal(giftOf('g1'), null)
})

test('clearAll removes the whole key (Friends off / delete profile)', () => {
  setGift('g1', { friendId: 'f1', name: 'Bob', brandKey: 'steam', state: 'claimed' })
  setGift('g2', { friendId: 'f2', name: 'Cy', brandKey: 'netflix', state: 'sent' })
  clearAll()
  assert.deepEqual(giftGoalIds(), [])
  assert.equal(localStorage.getItem(KEY), null)
})

test('bad stored data reads as empty', () => {
  localStorage.setItem(KEY, '{not json')
  assert.deepEqual(giftGoalIds(), [])
  assert.equal(giftOf('g1'), null)
})

test('reconcile: a claimed tag whose goal is gone is released and dropped', async () => {
  setGift('g1', { friendId: 'f1', name: 'Bob', brandKey: 'steam', state: 'claimed' })
  const calls = []
  await reconcile([], (friendId, brandKey) => { calls.push([friendId, brandKey]); return Promise.resolve() })
  assert.deepEqual(calls, [['f1', 'steam']])
  assert.equal(giftOf('g1'), null)
})

test('reconcile: a claimed tag whose goal is withdrawn or changed brand is released and dropped', async () => {
  setGift('g1', { friendId: 'f1', name: 'Bob', brandKey: 'steam', state: 'claimed' })
  setGift('g2', { friendId: 'f2', name: 'Cy', brandKey: 'netflix', state: 'claimed' })
  const calls = []
  const goals = [
    { id: 'g1', status: 'withdrawn', brandKey: 'steam' },
    { id: 'g2', status: 'saving', brandKey: 'apple' }, // card changed away from netflix
  ]
  await reconcile(goals, (f, b) => { calls.push([f, b]); return Promise.resolve() })
  assert.deepEqual(calls.sort(), [['f1', 'steam'], ['f2', 'netflix']])
  assert.deepEqual(giftGoalIds(), [])
})

test('reconcile: a healthy claimed tag is kept, no server call', async () => {
  setGift('g1', { friendId: 'f1', name: 'Bob', brandKey: 'steam', state: 'claimed' })
  const calls = []
  await reconcile([{ id: 'g1', status: 'saving', brandKey: 'steam' }], (f, b) => { calls.push([f, b]) })
  assert.equal(calls.length, 0)
  assert.equal(giftOf('g1').state, 'claimed')
})

test('reconcile: a sent tag whose goal is gone is dropped locally with no server call', async () => {
  setGift('g1', { friendId: 'f1', name: 'Bob', brandKey: 'steam', state: 'sent' })
  const calls = []
  await reconcile([], (f, b) => { calls.push([f, b]) })
  assert.equal(calls.length, 0)
  assert.equal(giftOf('g1'), null)
})

test('reconcile: a sent tag whose goal still exists is kept', async () => {
  setGift('g1', { friendId: 'f1', name: 'Bob', brandKey: 'steam', state: 'sent', thanked: true })
  await reconcile([{ id: 'g1', status: 'redeemed', brandKey: 'steam' }], () => { throw new Error('should not call') })
  assert.equal(giftOf('g1').state, 'sent')
  assert.equal(giftOf('g1').thanked, true)
})

test('reconcile: a direct tag survives a card change, is dropped only when the goal is gone, never a server call', async () => {
  setGift('g1', { friendId: 'f1', name: 'Bob', brandKey: 'steam', state: 'claimed', direct: true })
  setGift('g2', { friendId: 'f2', name: 'Cy', brandKey: 'netflix', state: 'claimed', direct: true })
  // g1's card changed away from steam, g2's goal is gone.
  await reconcile([{ id: 'g1', status: 'saving', brandKey: 'apple' }], () => { throw new Error('should not call') })
  assert.ok(giftOf('g1'), 'the direct tag survives a card change')
  assert.equal(giftOf('g2'), null, 'the direct tag whose goal is gone is dropped')
})

test('newGiftId is 32 hex; giftInKeyOf keys direct by giftId, wishlist by giver and brand', () => {
  assert.match(newGiftId(), /^[0-9a-f]{32}$/)
  assert.equal(giftInKeyOf({ kind: 'direct', giftId: 'abc', brandKey: 'steam', from: { id: 'x' } }), 'd:abc')
  assert.equal(giftInKeyOf({ brandKey: 'steam', from: { id: 'x' } }), 'x:steam')
})
