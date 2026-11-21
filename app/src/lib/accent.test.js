// The name-accent class (lib/accent.js). Coral chosen colours the name; never chose (null/undefined) or an unknown id
// adds nothing, so the name keeps its normal colour.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accentClass, ACCENT_IDS } from './accent.js'

test('a chosen accent (Coral included) gives its colour class', () => {
  assert.equal(accentClass('coral'), 'lk-acc lk-acc-coral')
  assert.equal(accentClass('mint'), 'lk-acc lk-acc-mint')
  assert.equal(accentClass('sunset'), 'lk-acc lk-acc-sunset')
})

test('never chose (null / undefined) adds no class, so the name keeps its normal colour', () => {
  assert.equal(accentClass(null), '')
  assert.equal(accentClass(undefined), '')
  assert.equal(accentClass(''), '')
})

test('an unknown id adds no class', () => {
  assert.equal(accentClass('rainbow'), '')
  assert.equal(accentClass(12), '')
})

test('Coral is one of the accent ids (it colours the name like the others)', () => {
  assert.ok(ACCENT_IDS.includes('coral'))
  for (const id of ACCENT_IDS) assert.equal(accentClass(id), `lk-acc lk-acc-${id}`)
})
