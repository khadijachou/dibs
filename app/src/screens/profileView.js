// Profile helpers (plain JS so node --test can load it). Display only: every answer comes from lib/rewards.js.
import { REWARD_IDS, active as rewardsActive, state as rewardState } from '../lib/rewards.js'

// The rewards ready to claim, in REWARD_IDS order: one claim banner each under the Profile header.
// None once the rewards program is over.
export function claimable({ badges = {}, goals = [], now = Date.now() } = {}) {
  if (!rewardsActive(now)) return []
  return REWARD_IDS.filter((id) => rewardState(id, { badges, goals, now }).state === 'claim')
}
