// Profile helpers (plain JS so node --test can load it). Display only: every answer comes from lib/rewards.js.
import { REWARD_IDS, active as rewardsActive, state as rewardState } from '../lib/rewards.js'

// The rewards ready to claim, in REWARD_IDS order: one claim banner each under the Profile header.
// None once the rewards program is over.
export function claimable({ badges = {}, goals = [], now = Date.now() } = {}) {
  if (!rewardsActive(now)) return []
  return REWARD_IDS.filter((id) => rewardState(id, { badges, goals, now }).state === 'claim')
}

// The weekly streak row in the level card, from rhythm() (lib/xp.js) as the card already receives it.
// lit: bars lit out of 5 (the rhythm level); text: the weeks in a row, or the invitation when there are none;
// bonus: "+{pct}% XP" only while the level is above 0. Level and weeks can differ: a missed week lowers the
// level by one while the weeks count restarts.
export const STREAK_BARS = 5
export function streakView({ level = 0, weeks = 0 } = {}, t) {
  const lit = Math.max(0, Math.min(STREAK_BARS, level))
  if (!(weeks > 0)) return { lit, text: t('xp_streak_none'), bonus: null, none: true }
  return {
    lit,
    text: weeks === 1 ? t('xp_streak_one') : t('xp_streak', { weeks }),
    bonus: lit > 0 ? t('xp_streak_bonus', { pct: lit * 10 }) : null,
    none: false,
  }
}
