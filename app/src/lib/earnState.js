// Why "Earned so far" shows what it shows. Pure: no storage, no network, no React.
//   stopped: the active stake holds less than the NIM in saving goals, or NIM is leaving staking (inactive or retired)
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

export function earnState({ st, inGoals = 0, earned = null, since = null, now = Date.now() }) {
  const leaving = st ? Number(st.inactiveBalance ?? 0) + Number(st.retiredBalance ?? 0) > 0 : false
  if (leaving || (inGoals > 0 && activeNim(st) + EPS < inGoals)) return 'stopped'
  const started = since ? Date.parse(since) : NaN
  if (earned === 0 && Number.isFinite(started) && now - started < FIRST_PAYOUT_MS) return 'first'
  return 'earning'
}
