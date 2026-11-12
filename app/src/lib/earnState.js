// Why "Earned so far" shows what it shows. Pure: no storage, no network, no React.
//   stopped: the active stake is 0 while NIM is staked or in goals: nothing earns
//   partial: the active stake is above 0 and some NIM is leaving staking (inactive, retired, or in a goal that is
//            unlocking): that part no longer earns, the rest does. Wins over first.
//   first:   nothing earned yet and Dibs started measuring less than 12 hours ago (the pool pays about every 12 h)
//   earning: otherwise
// Garuda Pool adds rewards about every 12 hours (00:16 and 12:16 UTC, checked on chain 12 Nov); stopped or unlocking
// NIM earns nothing. Does not touch the earned figure itself (profileStats.stakeEarnings).
import { toNim } from './config.js'

export const FIRST_PAYOUT_MS = 12 * 3_600_000
const EPS = 0.00001 // one luna

export function activeNim(st) {
  return st ? toNim(Number(st.balance ?? st.activeBalance ?? 0)) : 0
}

// NIM leaving staking: what the chain already holds as inactive or retired, or the NIM of goals that are unlocking
// (Stop staking not confirmed yet), whichever is larger. The two are the same NIM, never added together.
export function leavingNim(st, unlockingNim = 0) {
  const onChain = st ? toNim(Number(st.inactiveBalance ?? 0) + Number(st.retiredBalance ?? 0)) : 0
  return Math.max(onChain, unlockingNim > 0 ? unlockingNim : 0)
}

export function earnState({ st, inGoals = 0, unlockingNim = 0, earned = null, since = null, now = Date.now() }) {
  const active = activeNim(st)
  const leaving = leavingNim(st, unlockingNim)
  if (active < EPS && (leaving > 0 || inGoals > 0)) return 'stopped'
  if (active >= EPS && leaving > 0) return 'partial'
  const started = since ? Date.parse(since) : NaN
  if (earned === 0 && Number.isFinite(started) && now - started < FIRST_PAYOUT_MS) return 'first'
  return 'earning'
}
