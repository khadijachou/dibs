import { test } from 'node:test'
import assert from 'node:assert/strict'
import { depositSound, soundPlan } from './sound.js'

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

test('a sound not started by a tap: play, resume first, or stay silent', () => {
  // no context yet (no tap at this launch): never created here
  assert.equal(soundPlan(null, true), 'silent')
  assert.equal(soundPlan(null, false), 'silent')
  assert.equal(soundPlan('running', true), 'play')
  // iOS after Nimiq Pay's approval sheet, or back from the background
  assert.equal(soundPlan('suspended', true), 'resume')
  assert.equal(soundPlan('interrupted', true), 'resume')
  assert.equal(soundPlan('closed', true), 'silent')
  // no tap on this page: silent whatever the state
  assert.equal(soundPlan('running', false), 'silent')
  assert.equal(soundPlan('suspended', false), 'silent')
  assert.equal(soundPlan('weird', true), 'silent')
})
