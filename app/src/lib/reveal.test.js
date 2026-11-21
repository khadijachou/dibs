// Gift reveal queue (lib/reveal.js): oldest first, one per launch, seen is remembered, malformed gifts are skipped.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}
const { nextReveal, markRevealSeen, revealKey, revealSeen } = await import('./reveal.js')
beforeEach(() => mem.clear())

const gift = (fromId, brandKey, over = {}) => ({ brandKey, from: { id: fromId, name: fromId, seed: fromId }, thanked: false, ...over })
const A = gift('ann', 'spotify')
const B = gift('bob', 'netflix')

test('nextReveal returns the first unseen gift (oldest first = server order)', () => {
  assert.equal(nextReveal([A, B]), A)
  assert.equal(nextReveal([B, A]), B)
})

test('one reveal per launch: marking the first seen moves to the next, then to null', () => {
  assert.equal(nextReveal([A, B]), A)
  markRevealSeen(A)
  assert.equal(nextReveal([A, B]), B)
  markRevealSeen(B)
  assert.equal(nextReveal([A, B]), null)
})

test('a gift seen on this phone never comes back, its twins by other givers still show', () => {
  markRevealSeen(A)
  // Same brand, different giver: a different key, still shown.
  const C = gift('cat', 'spotify')
  assert.equal(nextReveal([A, C]), C)
})

test('seen is keyed by giver id and brand, not a code or address', () => {
  assert.equal(revealKey(A), 'ann:spotify')
  markRevealSeen(A)
  assert.deepEqual(revealSeen(), ['ann:spotify'])
})

test('markRevealSeen is idempotent and ignores a malformed gift', () => {
  markRevealSeen(A); markRevealSeen(A)
  assert.deepEqual(revealSeen(), ['ann:spotify'])
  markRevealSeen({ brandKey: 'x' }) // no giver
  markRevealSeen({ from: { id: 'y' } }) // no brand
  assert.deepEqual(revealSeen(), ['ann:spotify'])
})

test('malformed gifts in the list are skipped, not shown', () => {
  assert.equal(nextReveal([{ brandKey: 'x' }, { from: { id: 'y' } }, A]), A)
  assert.equal(nextReveal([]), null)
  assert.equal(nextReveal(null), null)
})
