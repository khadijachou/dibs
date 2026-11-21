// Which message the Add NIM amount field shows, from the chain (a staker yet, the wallet balance) and the typed
// amount. Pure, so the choice is tested without the screen (screens/Goal.jsx renders the matching FieldError).
//   cantOpen    no staker yet and the wallet cannot cover the first deposit (needs `min`, 100 NIM).
//   underMin    first deposit typed under `min`.
//   emptyWallet a staker is already open but the wallet holds under 1 NIM: "add 0 NIM" makes no sense, so say it is
//               empty (no amount, no fix pill). Never together with cantOpen/underMin (those mean no staker).
//   overBalance the amount is more than the wallet holds (and none of the above).
// balance null (still reading) means no message yet. Exactly one flag is true at a time, or none.
export function depositFieldFlags({ hasStaker, balance, amountNim, min }) {
  if (balance == null) return { cantOpen: false, underMin: false, emptyWallet: false, overBalance: false }
  const cantOpen = !hasStaker && balance < min
  const underMin = !cantOpen && !hasStaker && amountNim > 0 && amountNim < min
  const emptyWallet = !cantOpen && Math.floor(balance) < 1
  const overBalance = !cantOpen && !underMin && !emptyWallet && amountNim > balance
  return { cantOpen, underMin, emptyWallet, overBalance }
}
