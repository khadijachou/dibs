import { test } from 'node:test'
import assert from 'node:assert/strict'
import { depositSound } from './sound.js'

test('one sound per deposit: 100 % > a 25/50/75 % mark > the clink', () => {
  assert.equal(depositSound(0, 0.1), 'clink')
  assert.equal(depositSound(0.2, 0.25), 'milestone')
  assert.equal(depositSound(0.3, 0.49), 'clink')
  assert.equal(depositSound(0.1, 0.8), 'milestone') // crosses several marks: still one chime
  assert.equal(depositSound(0.7, 1), 'goalDone')
  assert.equal(depositSound(0.2, 1), 'goalDone') // past the marks too: only the goal-complete sound
  assert.equal(depositSound(0, 1.2), 'goalDone')
  assert.equal(depositSound(1, 1.1), 'clink') // already complete
  assert.equal(depositSound(0.5, 0.6), 'clink') // was already at 50 %
})
