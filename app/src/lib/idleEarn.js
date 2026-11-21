// Savings "Not staked yet · in your wallet" card (v1.6.2, display only, pure). Two numbers:
//   idleNim: the wallet's liquid balance minus the NIM the goals count that is not staked (the stake gap), never below 0.
//   monthlyEstimate: what that idle NIM could earn in a month if it were staked, from THIS wallet's own rewards, never a
//     fixed percent. The observed daily rate = earned / inGoals / daysSince (lib/earned.js stakeSummary: earned over the
//     NIM staked in goals and the days since `since`), projected to 30 days. The "last 30 days" cannot be sliced out of
//     the single cumulative `earned` figure, so the average daily rate over the whole observed window is used; it equals
//     the last-30-days rate whenever staking rewards are steady. null when it cannot be computed: no stake yet (inGoals
//     is 0), earned null or not positive (first reward not in yet), or under one day of data. Pure: no storage, no React.
import { MIN_NEW_STAKER_NIM } from './config.js'

const DAY_MS = 864e5

// The wallet's liquid NIM that is not already counted by a goal: balance minus the stake gap, never below 0.
// A balance that is not a finite number (still loading) counts as 0, so the card stays hidden until it is read.
export function idleNim(balance, gap) {
  const b = Number.isFinite(balance) ? balance : 0
  const g = Number.isFinite(gap) ? gap : 0
  return Math.max(0, b - g)
}

// { earned, inGoals, since } from stakeSummary, plus idle (the idle NIM) and now. The estimated NIM earned in a month,
// or null when it cannot be computed reliably.
export function monthlyEstimate({ earned, inGoals, since, idle, now = Date.now() } = {}) {
  if (!(idle > 0)) return null
  if (!(inGoals > 0)) return null
  if (earned == null || !(earned > 0)) return null
  const days = since ? (now - Date.parse(since)) / DAY_MS : 0
  if (!(days >= 1)) return null
  const perDayPerNim = earned / inGoals / days
  const n = idle * perDayPerNim * 30
  return Number.isFinite(n) && n > 0 ? n : null
}

// Whether the idle-NIM card shows: never when idle is 0, and never under 100 NIM (MIN_NEW_STAKER_NIM, the first-deposit
// minimum) when the wallet has no staker yet, since that NIM could not open a stake on its own.
export function showIdleCard({ idle, hasStaker } = {}) {
  if (!(idle > 0)) return false
  if (!hasStaker && idle < MIN_NEW_STAKER_NIM) return false
  return true
}
