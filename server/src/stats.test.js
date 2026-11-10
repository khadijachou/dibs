import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EARNED_RULE, reliableEarned } from './stats.js'

test('earned counts only reports made with the honest rule', () => {
  // Old phones: total staked minus goal deposits (24,263 NIM "earned" for 47,797 saved).
  assert.equal(reliableEarned({ stakedNim: 72060, earnedNim: 24263, goalsActive: 3 }), null)
  assert.equal(reliableEarned({ earnedNim: 0.04, inGoalsNim: 200 }), null) // no rule marker
  assert.equal(reliableEarned({ earnedRule: EARNED_RULE, inGoalsNim: 200 }), null) // earned unknown on the phone
  assert.equal(reliableEarned({ earnedRule: EARNED_RULE, earnedNim: 0, inGoalsNim: 200 }), 0)
  assert.equal(reliableEarned({ earnedRule: EARNED_RULE, earnedNim: 2, inGoalsNim: 200 }), 2) // exactly 1 %
})

test('sanity check: earned above 1 % of the NIM it covers is dropped', () => {
  assert.equal(reliableEarned({ earnedRule: EARNED_RULE, earnedNim: 3, inGoalsNim: 200 }), null)
  assert.equal(reliableEarned({ earnedRule: EARNED_RULE, earnedNim: 1, inGoalsNim: 0 }), null)
})
