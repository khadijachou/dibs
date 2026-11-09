// Release timing for unstaked NIM. Pure functions, no browser imports, so `npm test` can run them in Node.
//
// Measured on mainnet (CLAUDE.md): staked NIM is released at the first block of the next epoch after
// inactiveFrom. Epochs are 43,200 blocks of about 1 s, aligned on multiples of 43,200.
// Real case: "Stop earning" at block 66,181,946 → inactiveFrom 66,182,401 → released at 66,225,601 (12 h 4 min).

export const EPOCH = 43_200
export const BLOCK_MS = 1000
// When the chain gives no inactiveFrom (demo wallet), estimate from the deactivate step: 12 h 4 min, measured.
export const FALLBACK_MS = (12 * 60 + 4) * 60_000

export const releaseBlockOf = (inactiveFrom) => (Math.floor(inactiveFrom / EPOCH) + 1) * EPOCH + 1

// Estimated wall-clock time of the release, from the current block height.
export const releaseAtMs = (inactiveFrom, currentBlock, now = Date.now()) =>
  now + Math.max(0, releaseBlockOf(inactiveFrom) - currentBlock) * BLOCK_MS

// What the clock shows: { due: true } once the estimate has passed ("Should be ready now"),
// otherwise whole hours and minutes, rounded up so it never reads 0 while time is left.
export function clockOf(leftMs) {
  if (!(leftMs > 0)) return { due: true }
  const mins = Math.ceil(leftMs / 60_000)
  return { due: false, h: Math.floor(mins / 60), m: mins % 60 }
}
