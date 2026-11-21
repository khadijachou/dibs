import { test } from 'node:test'
import assert from 'node:assert/strict'
import { letterFor, isImageDataUrl } from './friendAvatar.js'

test('letterFor: first letter or digit, uppercased', () => {
  assert.equal(letterFor('lina'), 'L')
  assert.equal(letterFor('Aziz'), 'A')
  assert.equal(letterFor(' élise'), 'É') // leading space skipped, accent kept
  assert.equal(letterFor('42 cats'), '4') // a digit counts
  assert.equal(letterFor('  7up'), '7')
})

test('letterFor: no letter or digit gives ?', () => {
  assert.equal(letterFor('🙂'), '?')
  assert.equal(letterFor('🙂🙂'), '?')
  assert.equal(letterFor('  '), '?')
  assert.equal(letterFor(''), '?')
  assert.equal(letterFor(null), '?')
  assert.equal(letterFor(undefined), '?')
  assert.equal(letterFor('...'), '?')
})

test('letterFor: skips leading punctuation/emoji to the first letter', () => {
  assert.equal(letterFor('·bob'), 'B')
  assert.equal(letterFor('🙂lina'), 'L')
})

test('isImageDataUrl: only png/svg base64 data URLs', () => {
  assert.equal(isImageDataUrl('data:image/png;base64,AAAA'), true)
  assert.equal(isImageDataUrl('data:image/svg+xml;base64,AAAA'), true)
  assert.equal(isImageDataUrl('data:image/gif;base64,AAAA'), false)
  assert.equal(isImageDataUrl('https://example.com/a.png'), false)
  assert.equal(isImageDataUrl('<img>'), false)
  assert.equal(isImageDataUrl(null), false)
})
