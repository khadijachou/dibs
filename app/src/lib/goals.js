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

// A goal can be deleted when it holds 0 NIM and no unlock of it is in progress (mainnet 10 Nov: a 0 % duplicate
// of a goal in its unlock could not be removed).
export const deletable = (g) => Boolean(g) && savedNim(g) === 0 && ['saving', 'redeemed', 'withdrawn'].includes(g.status)

// The other goal whose unlock is running (chain state waiting, ready or remove), if any. One staker holds every
// goal, so only one unlock can run at a time: a second one would read the first one's inactive NIM as its own.
export const unlockRunning = (address, exceptId = null) =>
  read(address).find((g) => g.id !== exceptId && g.status === 'unlocking') || null

// The open goal (not bought, not withdrawn) for this card, if any. Recovery links to it, never adds a second one.
export const openGoalFor = (goals, itemId) =>
  goals.filter((g) => g.itemId === itemId && g.status !== 'redeemed' && g.status !== 'withdrawn')
    .sort((a, b) => savedNim(b) - savedNim(a) || String(a.createdAt).localeCompare(String(b.createdAt)))[0] || null

// The open goal for this card other than `exceptId` (Change card: the goal being changed does not count).
export const cardTakenBy = (goals, itemId, exceptId = null) => openGoalFor(goals.filter((g) => g.id !== exceptId), itemId)

// Deleted goals never come back. Every copy is removed from every address it was saved under (Nimiq Pay rotates
// the funded address), and the id is kept in a device-wide list that adoptGoals and later merges respect.
const DELETED = 'dibs.deleted'
export const deletedIds = () => { try { return new Set(JSON.parse(localStorage.getItem(DELETED)) || []) } catch { return new Set() } }
function forget(ids) {
  if (!ids.length) return
  const gone = deletedIds()
  for (const id of ids) gone.add(id)
  try { localStorage.setItem(DELETED, JSON.stringify([...gone])) } catch { /* storage blocked */ }
  let keys = []
  try { keys = Object.keys(localStorage).filter((k) => k.startsWith('dibs.goals.')) } catch { return }
  for (const k of keys) {
    let list
    try { list = JSON.parse(localStorage.getItem(k)) || [] } catch { continue }
    const kept = list.filter((x) => !gone.has(x?.id))
    if (kept.length !== list.length) try { localStorage.setItem(k, JSON.stringify(kept)) } catch { /* storage blocked */ }
  }
}

// Deletes an empty goal everywhere on this device.
export function removeGoal(address, id) {
  const g = getGoal(address, id)
  if (!g) throw new Error('Goal not found')
  if (!deletable(g)) throw new Error('Goal still holds NIM')
  forget([id])
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
// Recovery (10 Nov, after a reinstall): never a second open goal for the same card. An empty copy is dropped
// when a goal for that card is already open; an empty open goal here gives way to a funded one found elsewhere.
export function adoptGoals(address) {
  const gone = deletedIds()
  let keys = []
  try { keys = Object.keys(localStorage).filter((k) => k.startsWith('dibs.goals.') && k !== key(address)) } catch { return }
  const mine = read(address)
  const ids = new Set(mine.map((g) => g.id))
  const extra = []
  for (const k of keys) {
    let goals = []
    try { goals = JSON.parse(localStorage.getItem(k)) || [] } catch { /* skip */ }
    for (const g of goals) if (g && g.id && !ids.has(g.id)) { ids.add(g.id); extra.push(g) }
  }
  const dropped = [...ids].filter((id) => gone.has(id)) // deleted earlier: copies still lying around go too
  let all = mine.filter((g) => !gone.has(g.id))
  for (const g of extra) {
    if (gone.has(g.id)) continue
    const open = g.status !== 'redeemed' && g.status !== 'withdrawn'
    const twin = open ? openGoalFor(all, g.itemId) : null
    if (twin && savedNim(g) === 0 && deletable(g)) { dropped.push(g.id); continue } // empty copy: link to the open goal
    if (twin && savedNim(twin) === 0 && deletable(twin)) { dropped.push(twin.id); all = all.filter((x) => x.id !== twin.id) } // funded one wins
    all.push(g)
  }
  if (!extra.length && !dropped.length) return
  write(address, all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))))
  forget(dropped)
}
