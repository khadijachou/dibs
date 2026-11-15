// The gap: how much NIM the goals count that is no longer in the staker at all. After an unlock finishes (Remove) the
// NIM comes back to the wallet, but the goals still count it (their progress does not change), so the ledger says more
// than the staker holds. Savings names that NIM so it does not look lost. Pure: no storage, no network, no React.
import { toNim } from './config.js'

// stakeGap({ st, goals, settling, pendingDeposit }) -> null or a whole number of NIM.
//   inGoals = savedNim of goals still saving or unlocking (the NIM the goals count).
//   staked  = active + inactive + retired on the chain (everything still in the staker; mid-unlock NIM that is
//             retired between Retire and Remove still counts, so no false gap shows during the unlock).
// null when the chain is unknown, while a deposit or an unlock is between the chain and the ledger (settling or a
// pending deposit: the figures would be wrong for a moment), or when the gap is under 1 NIM (rounding, nothing to say).
export function stakeGap({ st, goals = [], settling = false, pendingDeposit = false } = {}) {
  if (!st || settling || pendingDeposit) return null
  const inGoals = goals
    .filter((g) => g.status === 'saving' || g.status === 'unlocking')
    .reduce((s, g) => s + savedNim(g), 0)
  const staked = toNim(Number(st.balance ?? st.activeBalance ?? 0) + Number(st.inactiveBalance ?? 0) + Number(st.retiredBalance ?? 0))
  const gap = inGoals - staked
  return gap < 1 ? null : Math.floor(gap)
}

// The same gap, not rounded: null in exactly the same cases as stakeGap (unknown chain, settling, a pending deposit, or
// under 1 NIM), otherwise the exact inGoals - staked difference. The whole number shown and sent is Math.ceil of this
// (lib/restake.js wholeGap), so "In your wallet", the band and the amount can never disagree with what the goals count.
export function stakeGapExact({ st, goals = [], settling = false, pendingDeposit = false } = {}) {
  if (!st || settling || pendingDeposit) return null
  const inGoals = goals
    .filter((g) => g.status === 'saving' || g.status === 'unlocking')
    .reduce((s, g) => s + savedNim(g), 0)
  const staked = toNim(Number(st.balance ?? st.activeBalance ?? 0) + Number(st.inactiveBalance ?? 0) + Number(st.retiredBalance ?? 0))
  const gap = inGoals - staked
  return gap < 1 ? null : gap
}

const savedNim = (goal) => (Array.isArray(goal?.deposits) ? goal.deposits : []).reduce((s, d) => s + (Number(d?.nim) || 0), 0)
