import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getWishlist, has, toggle, WISHLIST_MAX } from './wishlist.js'

function fakeStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }
}
beforeEach(() => { globalThis.localStorage = fakeStorage() })

test('empty by default', () => {
  assert.deepEqual(getWishlist(), [])
  assert.equal(has('steam'), false)
})

test('toggle adds then removes', () => {
  assert.deepEqual(toggle('steam'), ['steam'])
  assert.equal(has('steam'), true)
  assert.deepEqual(toggle('netflix'), ['steam', 'netflix'])
  assert.deepEqual(toggle('steam'), ['netflix']) // removed
  assert.equal(has('steam'), false)
})

test('a toggle persists in storage', () => {
  toggle('apple')
  assert.deepEqual(JSON.parse(localStorage.getItem('dibs.wishlist')), ['apple'])
})

test('the cap: a new key beyond 60 is not added, removing still works', () => {
  const full = Array.from({ length: WISHLIST_MAX }, (_, i) => 'b' + i)
  localStorage.setItem('dibs.wishlist', JSON.stringify(full))
  assert.equal(getWishlist().length, 60)
  assert.equal(toggle('one-too-many').length, 60) // not added
  assert.equal(has('one-too-many'), false)
  assert.equal(toggle('b0').length, 59) // removing a present one still works
})

test('bad stored data reads as []', () => {
  localStorage.setItem('dibs.wishlist', '{not json')
  assert.deepEqual(getWishlist(), [])
  localStorage.setItem('dibs.wishlist', JSON.stringify({ a: 1 }))
  assert.deepEqual(getWishlist(), [])
  localStorage.setItem('dibs.wishlist', JSON.stringify(['ok', 5, null, 'two']))
  assert.deepEqual(getWishlist(), ['ok', 'two']) // non-strings dropped
})

test('toggle ignores a bad key', () => {
  assert.deepEqual(toggle(''), [])
  assert.deepEqual(toggle(null), [])
})
