// Back keeps your place (lib/scrollMemory.js): go() stamps the scroll on the pushed route, back() restores it clamped
// to the page. A target with no stamp (came from parentOf) goes to the top.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withScroll, restoreY } from './scrollMemory.js'

test('withScroll stamps the current scroll on the route it pushes', () => {
  assert.deepEqual(withScroll({ name: 'more', params: {} }, 480), { name: 'more', params: {}, scrollY: 480 })
})

test('withScroll rounds, floors at 0, and ignores a bad value', () => {
  assert.equal(withScroll({ name: 'more' }, 12.7).scrollY, 13)
  assert.equal(withScroll({ name: 'more' }, -5).scrollY, 0)
  assert.equal(withScroll({ name: 'more' }, NaN).scrollY, 0)
  assert.equal(withScroll({ name: 'more' }, undefined).scrollY, 0)
})

test('withScroll re-stamps rather than keeping a stale scrollY', () => {
  const once = withScroll({ name: 'more', params: {} }, 300)
  assert.equal(withScroll(once, 40).scrollY, 40) // leaving again from scroll 40, not the old 300
})

test('restoreY returns the saved scroll when it fits the page', () => {
  assert.equal(restoreY({ scrollY: 480 }, 2000, 800), 480) // page can scroll to 1200, 480 fits
})

test('restoreY clamps to the furthest the page can scroll (content shrank)', () => {
  assert.equal(restoreY({ scrollY: 5000 }, 2000, 800), 1200) // max = 2000 - 800
})

test('no saved scroll, or 0, goes to the top', () => {
  assert.equal(restoreY({ name: 'more', params: {} }, 2000, 800), 0) // parentOf target, no stamp
  assert.equal(restoreY({ scrollY: 0 }, 2000, 800), 0)
  assert.equal(restoreY(null, 2000, 800), 0)
})

test('restoreY never returns a negative target (page shorter than the viewport)', () => {
  assert.equal(restoreY({ scrollY: 300 }, 400, 800), 0)
})
