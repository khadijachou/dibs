// When the staking pool pays its next reward. Pure, display only; Savings shows it under Pool.
import { BLOCK_MS, EPOCH } from './release.js'

// Observed delay of the pool: its payout lands about 49 minutes AFTER the epoch ends, not at the epoch boundary.
// Measured from two payouts seen on chain (Nov 2026, at ~00:16 and ~12:16 UTC, while the epochs ended at ~23:27 and
// ~11:27). This is an observed property of the pool, not a chain rule, so it lives here as a named constant.
export const POOL_PAYOUT_DELAY_MS = 49 * 60 * 1000

// Wall-clock time of the next reward: the next epoch boundary plus the observed payout delay. If the payout of the
// epoch that just ended has not landed yet (we are still within delayMs of the last boundary), that one is next.
// null when block is not a positive number (unknown or unreadable height).
export function nextRewardAt(block, now, { epoch = EPOCH, blockMs = BLOCK_MS, delayMs = POOL_PAYOUT_DELAY_MS } = {}) {
  if (typeof block !== 'number' || !(block > 0)) return null
  const prevBoundary = Math.floor(block / epoch) * epoch
  const sincePrev = (block - prevBoundary) * blockMs
  // Within the delay window: the payout of the epoch that just ended is still ahead of us.
  if (sincePrev < delayMs) return now - sincePrev + delayMs
  // Otherwise the next payout is the next boundary plus the delay.
  return now + (prevBoundary + epoch - block) * blockMs + delayMs
}
