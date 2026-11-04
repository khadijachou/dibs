// Goal records. Week 1: kept in device storage, keyed by the user's address.
// Swap this module for server calls later; screens only use the functions below.
//
// A goal is an envelope over the user's single staker: the chain holds one stake,
// this ledger says how much of it belongs to each goal.
const key = (address) => `dibs.goals.${address}`

function read(address) {
  try { return JSON.parse(localStorage.getItem(key(address))) || [] } catch { return [] }
}
function write(address, goals) {
  try { localStorage.setItem(key(address), JSON.stringify(goals)) } catch { /* storage blocked */ }
}

export function listGoals(address) {
  return read(address)
}

export function getGoal(address, id) {
  return read(address).find((g) => g.id === id) || null
}

export function createGoal(address, { item, targetNim, deadline }) {
  const goal = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    itemId: item.id,
    itemName: item.name,
    itemDetail: item.detail,
    usd: item.usd,
    faceValue: item.faceValue || null,
    targetNim,
    deadline,
    deposits: [],
    unlockSteps: [], // { step: 'deactivate'|'retire'|'remove', tx, at }
    status: 'saving', // saving -> unlocking -> ready -> redeemed
    payment: null, // { hash, swapId, at, orderId }
    createdAt: new Date().toISOString(),
  }
  write(address, [goal, ...read(address)])
  return goal
}

export function updateGoal(address, id, patch) {
  const goals = read(address).map((g) => (g.id === id ? { ...g, ...patch } : g))
  write(address, goals)
  return goals.find((g) => g.id === id)
}

export function addDeposit(address, id, { nim, tx }) {
  const g = getGoal(address, id)
  if (!g) return null
  return updateGoal(address, id, { deposits: [...g.deposits, { nim, tx, at: new Date().toISOString() }] })
}

export const savedNim = (goal) => goal.deposits.reduce((s, d) => s + d.nim, 0)
export const progress = (goal) => Math.min(1, savedNim(goal) / goal.targetNim)

// Sum of NIM all goals still keep in the staker (used to compute the new active balance on unlock).
export function stakedInGoals(address) {
  return read(address)
    .filter((g) => g.status === 'saving' || g.status === 'unlocking')
    .reduce((s, g) => s + savedNim(g), 0)
}

// Does this device remember creating a staker? Used when no RPC read is available.
export const stakerFlag = {
  get: (address) => { try { return localStorage.getItem(`dibs.hasStaker.${address}`) === '1' } catch { return false } },
  set: (address) => { try { localStorage.setItem(`dibs.hasStaker.${address}`, '1') } catch { /* ignore */ } },
}

// When the app switches account (see getAccount), carry over goals saved under another
// shared account, so a goal is never lost because Nimiq Pay listed accounts differently.
export function adoptGoals(address, otherAddresses) {
  if (read(address).length) return
  for (const other of otherAddresses) {
    if (other === address) continue
    const goals = read(other)
    if (goals.length) { write(address, goals); return }
  }
}
