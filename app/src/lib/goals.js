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

export function createGoal(address, { item, targetNim, deadline, brand = null, nimUsd = null }) {
  const goal = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    itemId: item.id,
    itemName: item.name,
    itemDetail: item.detail,
    usd: item.usd,
    faceValue: item.faceValue || null,
    targetNim,
    deadline,
    brandKey: brand?.key || null,
    brandName: brand?.name || null,
    logo: brand?.logo || null,
    nimUsdAtCreate: nimUsd,
    deposits: [],
    unlockSteps: [], // { step: 'deactivate'|'retire'|'remove', tx, at }
    status: 'saving', // saving -> unlocking -> ready -> redeemed, or saving -> unlocking -> withdrawn
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

export function addDeposit(address, id, { nim, tx, id: depositId = null }) {
  const g = getGoal(address, id)
  if (!g) return null
  return updateGoal(address, id, { deposits: [...g.deposits, { id: depositId, nim, tx, at: new Date().toISOString() }] })
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

// Moves NIM between two goals in the ledger only. One staker holds both, so nothing moves on chain:
// a negative entry on the source and the same positive entry on the target keep savedNim a plain sum.
// `name` keeps the other goal's label so the row still reads well after that goal is deleted.
export function moveNim(address, fromId, toId, nim) {
  const goals = read(address)
  const from = goals.find((g) => g.id === fromId)
  const to = goals.find((g) => g.id === toId)
  if (!from || !to || fromId === toId) throw new Error('Goal not found')
  if (from.status !== 'saving' || to.status !== 'saving') throw new Error('Both goals must be saving')
  if (!(nim > 0) || nim > savedNim(from)) throw new Error('Amount out of range')
  const at = new Date().toISOString()
  const label = (g) => `${g.itemName} · ${g.itemDetail}`
  const next = goals.map((g) => {
    if (g.id === fromId) return { ...g, deposits: [...g.deposits, { id: newId(), nim: -nim, kind: 'move', to: toId, name: label(to), at }] }
    if (g.id === toId) return { ...g, deposits: [...g.deposits, { id: newId(), nim, kind: 'move', from: fromId, name: label(from), at }] }
    return g
  })
  write(address, next)
  return { from: next.find((g) => g.id === fromId), to: next.find((g) => g.id === toId) }
}

// Deletes an empty goal. Also clears copies kept under older addresses, or adoptGoals would bring it back.
export function removeGoal(address, id) {
  const g = getGoal(address, id)
  if (!g) throw new Error('Goal not found')
  if (savedNim(g) !== 0 || !['saving', 'redeemed', 'withdrawn'].includes(g.status)) throw new Error('Goal still holds NIM')
  let keys = [key(address)]
  try { keys = [...new Set([key(address), ...Object.keys(localStorage).filter((k) => k.startsWith('dibs.goals.'))])] } catch { /* storage blocked */ }
  for (const k of keys) {
    let list
    try { list = JSON.parse(localStorage.getItem(k)) || [] } catch { continue }
    if (!list.some((x) => x?.id === id)) continue
    try { localStorage.setItem(k, JSON.stringify(list.filter((x) => x?.id !== id))) } catch { /* storage blocked */ }
  }
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

// Goals are stored under the funded address, and that address can change: on 7 Nov, after
// a Remove, Nimiq Pay stopped listing NQ80... and listed a new funded NQ64... instead.
// So on start we merge goals saved under ANY address on this device into the current one
// (the current copy wins when both have the same goal), and never lose a goal to a rotation.
export function adoptGoals(address) {
  let keys = []
  try { keys = Object.keys(localStorage).filter((k) => k.startsWith('dibs.goals.') && k !== key(address)) } catch { return }
  if (!keys.length) return
  const mine = read(address)
  const ids = new Set(mine.map((g) => g.id))
  const extra = []
  for (const k of keys) {
    let goals = []
    try { goals = JSON.parse(localStorage.getItem(k)) || [] } catch { /* skip */ }
    for (const g of goals) if (g && g.id && !ids.has(g.id)) { ids.add(g.id); extra.push(g) }
  }
  if (extra.length) write(address, [...mine, ...extra].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))))
}
