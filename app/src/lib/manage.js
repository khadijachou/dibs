// Manage (⋯) on the goal screen: when it shows and which rows it holds. Pure rules, no ledger or chain access.
import { deletable } from './goals.js'

// Unlocking to buy the card (not to get the NIM back). Changing the card is local only (no transaction), so it is
// safe while the NIM unlocks: status, unlockSteps, unlockMode and deposits stay as they are.
export const unlockingForCard = (goal) => Boolean(goal) && goal.status === 'unlocking' && goal.unlockMode !== 'withdraw'

// ⋯ shows on saving and ready goals, on goals unlocking for their card (Change card only), and on any goal with
// 0 NIM and no unlock in progress (Delete). This goal's own pending deposit or pay lock closes it.
export const canManageGoal = (goal, { pending = false, payLocked = false } = {}) =>
  Boolean(goal) && (goal.status === 'saving' || goal.status === 'ready' || unlockingForCard(goal) || deletable(goal)) && !pending && !payLocked

// Rows of the Manage sheet, in order. Unlocking for the card: Change card only.
export function manageRows(goal) {
  if (unlockingForCard(goal)) return ['change']
  const rows = []
  if (goal.status === 'saving' || goal.status === 'ready') rows.push('change')
  if (goal.status !== 'ready') rows.push('move')
  rows.push('back', 'delete')
  return rows
}
