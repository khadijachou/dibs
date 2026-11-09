// Release timing for unstaked NIM. Pure functions, no browser imports, so `npm test` can run them in Node.
//
// Rule confirmed on mainnet: when step 1 lands, the chain sets inactiveFrom to the next election block
// (a multiple of 43,200), and the NIM is released one epoch later, at inactiveFrom + 43,201.
// 6 Nov: step 1 at block 66,181,946 → inactiveFrom 66,182,400 → released at 66,225,601 (12 h 4 min).
// 9 Nov: step 1 around 05:00, after the epoch that ended at 66,398,400 → inactiveFrom 66,441,600 → 66,484,801.
// So the whole wait is 12 to 24 h, depending on where in the epoch step 1 was sent.

export const EPOCH = 43_200
export const BLOCK_MS = 1000
// When the chain gives no inactiveFrom (demo wallet), estimate from the deactivate step: 12 h 4 min, measured.
export const FALLBACK_MS = (12 * 60 + 4) * 60_000

export const releaseBlockOf = (inactiveFrom) => inactiveFrom + EPOCH + 1

// Blocks still to go before the release (0 once it has passed).
export const blocksLeft = (inactiveFrom, currentBlock) => Math.max(0, releaseBlockOf(inactiveFrom) - currentBlock)

// Estimated wall-clock time of the release, from the current block height.
export const releaseAtMs = (inactiveFrom, currentBlock, now = Date.now()) =>
  now + blocksLeft(inactiveFrom, currentBlock) * BLOCK_MS

// Earliest block step 1 could have been sent for this inactiveFrom: the start of the epoch before it.
// Used as the timer's start when the goal has no step 1 time on record.
export const earliestStepBlockOf = (inactiveFrom) => inactiveFrom - EPOCH

// Share of the wait already behind us, 0 to 1. A missing or inverted window reads as 0.
export function progressOf(startMs, endMs, now = Date.now()) {
  if (!(endMs > startMs)) return now >= endMs ? 1 : 0
  return Math.min(1, Math.max(0, (now - startMs) / (endMs - startMs)))
}

// What the clock shows: { due: true } once the estimate has passed ("Should be ready now"),
// otherwise whole hours and minutes, rounded up so it never reads 0 while time is left.
export function clockOf(leftMs) {
  if (!(leftMs > 0)) return { due: true }
  const mins = Math.ceil(leftMs / 60_000)
  return { due: false, h: Math.floor(mins / 60), m: mins % 60 }
}
