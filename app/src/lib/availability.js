// Card availability over a long goal. Display and choices only: nothing here sends a transaction or changes the
// saved NIM; a goal's NIM stays in its ledger whatever happens to its card.
import { catalogFromServer, getCatalog } from './catalog.js'
import { versionOf } from './version.js'

// A value the shop does not sell: the server read the shop's list and this value is not in it (sold: false).
// Example (9 Nov): Riot Access "24.99" (the shop's package is "25", priced 24.99). It cannot be bought: the order
// would ask the shop for a package it does not have. live: false alone (no shop answer) never hides a value:
// on 10 Nov failed lookups hid Steam 20 and 50 USD. That value shows with ≈ and "Price confirmed at checkout".
export const notSold = (item) => item?.sold === false

// 'ok' | 'gone' (removed from the catalogue, or a value the shop does not sell) | 'out' (out of stock) |
// null (unknown: the catalogue did not come from the server, so nothing is judged).
export function cardAvailability(itemId) {
  if (!catalogFromServer()) return null
  const items = getCatalog()
  const item = items.find((i) => i.id === itemId)
  if (!item || notSold(item, items)) return 'gone'
  if (item.inStock === false) return 'out'
  return 'ok'
}

// Goals still headed for their card: saving, unlocking, or unlocked and waiting to buy.
const ACTIVE = new Set(['saving', 'unlocking', 'ready'])
export const goalCardIssue = (goal) => {
  if (!goal || !ACTIVE.has(goal.status)) return null
  const a = cardAvailability(goal.itemId)
  return a === 'gone' || a === 'out' ? a : null
}

// A payment whose outcome is unknown (dibs.pending kind 'pay') must settle before the card can change.
export const payLockedFor = (goalId) => {
  try { const p = JSON.parse(localStorage.getItem('dibs.pending')); return p?.kind === 'pay' && p.goalId === goalId } catch { return false }
}

// Swaps the goal's card (also on a 'ready' goal: Manage > Change card). Keeps id, deposits (and so the saved NIM), unlock steps, status, deadline and history; the
// target is the new card at today's price. The old card is kept in cardChanges. Returns the patch for updateGoal().
export function cardChangePatch(goal, { item, targetNim, brand, nimUsd }) {
  const at = new Date().toISOString()
  return {
    itemId: item.id,
    itemName: item.name,
    itemDetail: item.detail,
    usd: item.usd,
    faceValue: item.faceValue || null,
    ...versionOf(item), // the new card's version (region, currency, worksWith)
    targetNim,
    brandKey: brand?.key || null,
    brandName: brand?.name || null,
    logo: brand?.logo || null,
    nimUsdAtCreate: nimUsd,
    cardChanges: [...(goal.cardChanges || []), {
      at, itemId: goal.itemId, itemName: goal.itemName, itemDetail: goal.itemDetail, usd: goal.usd, targetNim: goal.targetNim, region: goal.region || null,
    }],
  }
}

// "Get my NIM back" on a goal whose NIM is already unlocked and back in the wallet (status ready): no transaction,
// the ledger records the return exactly as the Unlock screen does when a withdraw ends.
export function readyReturnPatch(goal, saved) {
  const at = new Date().toISOString()
  return {
    status: 'withdrawn', unlockMode: 'withdraw', withdrawnAt: at,
    deposits: [...goal.deposits, { id: crypto.randomUUID?.() || at, nim: -saved, kind: 'withdraw', at }],
  }
}
