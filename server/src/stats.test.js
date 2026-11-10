import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EARNED_RULE, maxEarned, reliableEarned } from './stats.js'

const rep = (earnedNim, inGoalsNim, earnedDays) => ({ earnedRule: EARNED_RULE, earnedNim, inGoalsNim, earnedDays })

test('earned counts only reports made with the honest rule', () => {
  // Old phones: total staked minus goal deposits (24,263 NIM "earned" for 47,797 saved).
  assert.equal(reliableEarned({ stakedNim: 72060, earnedNim: 24263, goalsActive: 3 }), null)
  assert.equal(reliableEarned({ earnedNim: 0.04, inGoalsNim: 200, earnedDays: 3 }), null) // no rule marker
  assert.equal(reliableEarned({ earnedRule: EARNED_RULE, inGoalsNim: 200, earnedDays: 3 }), null) // unknown on the phone
  assert.equal(reliableEarned({ earnedRule: EARNED_RULE, earnedNim: 0.04, inGoalsNim: 200 }), null) // no days: cannot check
  assert.equal(reliableEarned(rep(0, 200, 0)), 0)
  assert.equal(reliableEarned(rep(0.04, 200, 3)), 0.04) // mainnet, 4 to 7 Nov
})

test('sanity check: earned within 25 % a year of the NIM it covers, plus 1 NIM', () => {
  assert.equal(maxEarned(1000, 365), 251)
  // 10 % a year for 60 days on 1,000 NIM (16.4 NIM): kept, though above 1 %.
  assert.equal(reliableEarned(rep(16.4, 1000, 60)), 16.4)
  assert.equal(reliableEarned(rep(42, 1000, 60)), 42) // 41.1 + 1 allowed
  assert.equal(reliableEarned(rep(43, 1000, 60)), null)
  assert.equal(reliableEarned(rep(24263, 47797, 30)), null) // the bad figure, even with the marker
  assert.equal(reliableEarned(rep(0.5, 200, 0)), 0.5) // rounding floor on day one
  assert.equal(reliableEarned(rep(1, 0, 10)), null) // earned on nothing
})
