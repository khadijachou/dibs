import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// goals.js keeps the ledger in localStorage: a Map-backed stand-in for node.
const store = new Map()
const api = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
// Object.keys(localStorage) must list the saved keys, as in a browser.
globalThis.localStorage = new Proxy(api, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)),
})

const { adoptGoals, createGoal, listGoals, openGoalFor, updateGoal } = await import('./goals.js')

// Catalogue ids are brand + region + value (`npm run catalog -- add` builds `${slug}-${value}` and refuses a second one).
const STEAM_5_USA = { id: 'steam-5', name: 'Steam gift card', detail: '5 USD', usd: 5.62, faceValue: '5' }
const STEAM_20_USA = { id: 'steam-20', name: 'Steam gift card', detail: '20 USD', usd: 22.48, faceValue: '20' }
const STEAM_5_EU = { id: 'steam-eu-5', name: 'Steam gift card', detail: '5 USD', usd: 5.9, faceValue: '5' }

const ADDR = 'NQ00 TEST'
const make = (item, patch = {}) => {
  const g = createGoal(ADDR, { item, targetNim: 20000, deadline: '2027-01-01' })
  return Object.keys(patch).length ? updateGoal(ADDR, g.id, patch) : g
}
// What Plan.jsx `create` does: redirect to this goal when it exists, else create a new one.
const existingFor = (item) => openGoalFor(listGoals(ADDR), item.id)

beforeEach(() => store.clear())

test('Steam 5 USD USA open, new Steam 5 USD USA: redirected to the existing goal', () => {
  const open = make(STEAM_5_USA, { deposits: [{ nim: 5000, at: '2026-11-01T00:00:00Z' }] })
  assert.equal(existingFor(STEAM_5_USA)?.id, open.id)
})

test('Steam 5 USD USA open, new Steam 20 USD USA: new goal created', () => {
  make(STEAM_5_USA)
  assert.equal(existingFor(STEAM_20_USA), null)
})

test('Steam 5 USD USA open, new Steam 5 USD EU: new goal created', () => {
  make(STEAM_5_USA)
  assert.equal(existingFor(STEAM_5_EU), null)
})

test('Steam 5 USD USA bought, new Steam 5 USD USA: new goal created', () => {
  make(STEAM_5_USA, { status: 'redeemed', payment: { orderId: 'o1', at: '2026-11-09T00:00:00Z' } })
  assert.equal(existingFor(STEAM_5_USA), null)
})

test('Steam 5 USD USA in unlock waiting, new Steam 5 USD USA: redirected', () => {
  const waiting = make(STEAM_5_USA, { status: 'unlocking', deposits: [{ nim: 20000, at: '2026-11-01T00:00:00Z' }], unlockSteps: [{ step: 'deactivate', tx: 't', at: '2026-11-10T00:00:00Z' }] })
  assert.equal(existingFor(STEAM_5_USA)?.id, waiting.id)
})

test('every open status blocks (saving, reached, unlocking, ready / paying); bought and withdrawn do not', () => {
  for (const [status, nim, blocks] of [['saving', 0, true], ['saving', 20000, true], ['unlocking', 20000, true], ['ready', 20000, true], ['redeemed', 0, false], ['withdrawn', 0, false]]) {
    store.clear()
    const g = make(STEAM_5_USA, { status, deposits: nim ? [{ nim, at: '2026-11-01T00:00:00Z' }] : [] })
    assert.equal(existingFor(STEAM_5_USA)?.id ?? null, blocks ? g.id : null, status)
  }
})

test('merge on start: an empty copy of a card in unlock waiting is not added; other cards are', () => {
  const waiting = make(STEAM_5_USA, { status: 'unlocking', deposits: [{ nim: 20000, at: '2026-11-01T00:00:00Z' }] })
  const old = 'NQ99 OLD'
  localStorage.setItem(`dibs.goals.${old}`, JSON.stringify([
    { id: 'dup', itemId: STEAM_5_USA.id, status: 'saving', deposits: [], createdAt: '2026-11-02T00:00:00Z' },
    { id: 'eu', itemId: STEAM_5_EU.id, status: 'saving', deposits: [], createdAt: '2026-11-02T00:00:00Z' },
    { id: 'usd20', itemId: STEAM_20_USA.id, status: 'saving', deposits: [], createdAt: '2026-11-02T00:00:00Z' },
  ]))
  adoptGoals(ADDR)
  const ids = listGoals(ADDR).map((g) => g.id).sort()
  assert.deepEqual(ids, [waiting.id, 'eu', 'usd20'].sort())
})

test('merge on start: a bought copy never blocks; an empty open goal here gives way to a funded copy', () => {
  const empty = make(STEAM_5_USA)
  localStorage.setItem('dibs.goals.NQ99 OLD', JSON.stringify([
    { id: 'bought', itemId: STEAM_5_USA.id, status: 'redeemed', deposits: [], createdAt: '2026-10-01T00:00:00Z' },
    { id: 'funded', itemId: STEAM_5_USA.id, status: 'saving', deposits: [{ nim: 3000 }], createdAt: '2026-10-02T00:00:00Z' },
  ]))
  adoptGoals(ADDR)
  const ids = listGoals(ADDR).map((g) => g.id)
  assert.ok(!ids.includes(empty.id))
  assert.deepEqual(ids.sort(), ['bought', 'funded'])
})

// Deleted goals never come back.
const { cardTakenBy, deletedIds, removeGoal } = await import('./goals.js')
const OLD = 'NQ99 OLD'
const savedUnder = (addr) => JSON.parse(localStorage.getItem(`dibs.goals.${addr}`) || '[]').map((g) => g.id)

test('a deleted goal is removed under every address and never adopted again', () => {
  const g = make(STEAM_5_USA)
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([{ ...g }])) // same goal, kept under a rotated address
  removeGoal(ADDR, g.id)
  assert.deepEqual(savedUnder(ADDR), [])
  assert.deepEqual(savedUnder(OLD), [])
  assert.ok(deletedIds().has(g.id))
  // A copy that survives somewhere (storage restored, old backup): the merge on start drops it again.
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([{ ...g }]))
  adoptGoals(ADDR)
  assert.deepEqual(savedUnder(ADDR), [])
  assert.deepEqual(savedUnder(OLD), [])
})

test('an empty duplicate dropped on start does not come back after the open goal is bought', () => {
  const open = make(STEAM_5_USA, { deposits: [{ nim: 20000, at: '2026-11-01T00:00:00Z' }] })
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([{ id: 'dup', itemId: STEAM_5_USA.id, status: 'saving', deposits: [], createdAt: '2026-11-02T00:00:00Z' }]))
  adoptGoals(ADDR)
  assert.deepEqual(savedUnder(OLD), [])
  updateGoal(ADDR, open.id, { status: 'redeemed' })
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([{ id: 'dup', itemId: STEAM_5_USA.id, status: 'saving', deposits: [], createdAt: '2026-11-02T00:00:00Z' }]))
  adoptGoals(ADDR)
  assert.deepEqual(savedUnder(ADDR), [open.id])
})

test('an empty open goal that gives way to a funded copy is deleted for good', () => {
  const empty = make(STEAM_5_USA)
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([{ id: 'funded', itemId: STEAM_5_USA.id, status: 'saving', deposits: [{ nim: 3000 }], createdAt: '2026-10-02T00:00:00Z' }]))
  adoptGoals(ADDR)
  assert.ok(deletedIds().has(empty.id))
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([{ ...empty }, { id: 'funded', itemId: STEAM_5_USA.id, status: 'saving', deposits: [{ nim: 3000 }], createdAt: '2026-10-02T00:00:00Z' }]))
  adoptGoals(ADDR)
  assert.deepEqual(savedUnder(ADDR), ['funded'])
})

// Change card (Plan.jsx): the new card must not already have another open goal.
test('change card onto a card with another open goal: blocked, points to that goal', () => {
  const steam5 = make(STEAM_5_USA, { deposits: [{ nim: 1000, at: '2026-11-01T00:00:00Z' }] })
  const steam20 = make(STEAM_20_USA)
  assert.equal(cardTakenBy(listGoals(ADDR), STEAM_5_USA.id, steam20.id)?.id, steam5.id)
})

test('change card onto a free card, a bought or withdrawn card, or its own card: allowed', () => {
  const g = make(STEAM_20_USA)
  assert.equal(cardTakenBy(listGoals(ADDR), STEAM_5_EU.id, g.id), null)
  assert.equal(cardTakenBy(listGoals(ADDR), STEAM_20_USA.id, g.id), null)
  make(STEAM_5_USA, { status: 'redeemed' })
  make(STEAM_5_USA, { status: 'withdrawn' })
  assert.equal(cardTakenBy(listGoals(ADDR), STEAM_5_USA.id, g.id), null)
})

test('change card onto a card whose goal is in unlock: blocked', () => {
  const waiting = make(STEAM_5_USA, { status: 'unlocking', deposits: [{ nim: 20000, at: '2026-11-01T00:00:00Z' }] })
  const g = make(STEAM_20_USA)
  assert.equal(cardTakenBy(listGoals(ADDR), STEAM_5_USA.id, g.id)?.id, waiting.id)
})

// v1.1.9: the same goal saved under two addresses (Nimiq Pay rotates the funded address). 13 Nov: the old 'unlocking'
// copy under the current address beat the 'ready' one and Stop staking was offered again.
const { newerCopy } = await import('./goals.js')
const STEPS3 = [{ step: 'deactivate', tx: 'a', at: '2026-11-12T03:00:00Z' }, { step: 'retire', tx: 'b', at: '2026-11-12T15:00:00Z' }, { step: 'remove', tx: 'c', at: '2026-11-12T15:01:00Z' }]
const copyOf = (patch) => ({ id: 'g1', itemId: STEAM_20_USA.id, deposits: [{ nim: 11753, at: '2026-11-01T00:00:00Z' }], unlockSteps: [], status: 'saving', createdAt: '2026-11-01T00:00:00Z', ...patch })
const goalUnder = (addr, id = 'g1') => JSON.parse(localStorage.getItem(`dibs.goals.${addr}`) || '[]').find((g) => g.id === id)

test('v1.1.9 an old unlocking copy here and a ready copy elsewhere (no stamps): the ready one is kept with all its steps', () => {
  localStorage.setItem(`dibs.goals.${ADDR}`, JSON.stringify([copyOf({ status: 'unlocking', unlockSteps: STEPS3.slice(0, 1) })]))
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([copyOf({ status: 'ready', unlockSteps: STEPS3 })]))
  adoptGoals(ADDR)
  const g = goalUnder(ADDR)
  assert.equal(g.status, 'ready')
  assert.deepEqual(g.unlockSteps, STEPS3)
  assert.equal(listGoals(ADDR).length, 1)
  assert.equal(goalUnder(OLD).status, 'ready') // the other copy is left in storage
})

test('v1.1.9 two stamped copies: the newer wins, whichever address it is under', () => {
  const older = copyOf({ status: 'ready', unlockSteps: STEPS3, updatedAt: '2026-11-13T10:00:00.000Z' })
  const newer = copyOf({ status: 'unlocking', unlockSteps: STEPS3.slice(0, 1), updatedAt: '2026-11-13T11:00:00.000Z' })
  localStorage.setItem(`dibs.goals.${ADDR}`, JSON.stringify([older]))
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([newer]))
  adoptGoals(ADDR)
  assert.equal(goalUnder(ADDR).updatedAt, newer.updatedAt)
  store.clear()
  localStorage.setItem(`dibs.goals.${ADDR}`, JSON.stringify([newer]))
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([older]))
  adoptGoals(ADDR)
  assert.equal(goalUnder(ADDR).updatedAt, newer.updatedAt)
})

test('v1.1.9 unstamped copies: furthest status, then more unlock steps, then more deposits; a tie keeps the copy here', () => {
  assert.ok(newerCopy(copyOf({ status: 'redeemed' }), copyOf({ status: 'ready' })))
  assert.ok(newerCopy(copyOf({ status: 'withdrawn' }), copyOf({ status: 'unlocking' })))
  // One stamp only: the stamped copy wins, whatever the status.
  assert.ok(!newerCopy(copyOf({ status: 'ready' }), copyOf({ status: 'unlocking', updatedAt: '2026-11-13T11:00:00.000Z' })))
  assert.ok(newerCopy(copyOf({ status: 'unlocking', updatedAt: '2026-11-13T11:00:00.000Z' }), copyOf({ status: 'ready' })))
  assert.ok(!newerCopy(copyOf({ status: 'redeemed', updatedAt: 'not a date' }), copyOf({ status: 'saving', updatedAt: '2026-11-13T11:00:00.000Z' }))) // invalid stamp = none
  assert.ok(newerCopy(copyOf({ status: 'unlocking' }), copyOf({ status: 'saving' })))
  assert.ok(newerCopy(copyOf({ status: 'unlocking', unlockSteps: STEPS3.slice(0, 2) }), copyOf({ status: 'unlocking', unlockSteps: STEPS3.slice(0, 1) })))
  const two = copyOf({ deposits: [{ nim: 1 }, { nim: 2 }] })
  assert.ok(newerCopy(two, copyOf({})))
  assert.ok(!newerCopy(copyOf({}), copyOf({}))) // tie
  // Deposits are never merged: the kept copy has its own deposits only.
  localStorage.setItem(`dibs.goals.${ADDR}`, JSON.stringify([copyOf({ deposits: [{ nim: 5 }] })]))
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([two]))
  adoptGoals(ADDR)
  assert.deepEqual(goalUnder(ADDR).deposits, two.deposits)
})

test('v1.1.9 a stamped unlocking copy here beats an unstamped ready copy elsewhere, on every start', () => {
  const live = copyOf({ status: 'unlocking', unlockSteps: STEPS3.slice(0, 1), updatedAt: '2026-11-13T15:07:00.000Z' })
  localStorage.setItem(`dibs.goals.${ADDR}`, JSON.stringify([live]))
  localStorage.setItem(`dibs.goals.${OLD}`, JSON.stringify([copyOf({ status: 'ready', unlockSteps: STEPS3 })]))
  for (let start = 1; start <= 3; start++) {
    adoptGoals(ADDR)
    assert.deepEqual(goalUnder(ADDR), live, `start ${start}`)
    assert.equal(goalUnder(OLD).status, 'ready', `start ${start}: the other copy stays in storage`)
  }
})

test('v1.1.9 one goal, one copy: adoptGoals changes nothing', () => {
  const g = make(STEAM_5_USA, { deposits: [{ nim: 5000, at: '2026-11-01T00:00:00Z' }] })
  const before = localStorage.getItem(`dibs.goals.${ADDR}`)
  adoptGoals(ADDR)
  assert.equal(localStorage.getItem(`dibs.goals.${ADDR}`), before)
  assert.equal(listGoals(ADDR)[0].id, g.id)
})

test('v1.1.9 every goal write stamps updatedAt (create, update, move); deposits and payment are not touched', async () => {
  const { addDeposit, moveNim } = await import('./goals.js')
  const a = make(STEAM_5_USA)
  assert.ok(Date.parse(a.updatedAt) > 0)
  const b = createGoal(ADDR, { item: STEAM_20_USA, targetNim: 100, deadline: '2027-01-01' })
  assert.equal(b.updatedAt, b.createdAt)
  const d = addDeposit(ADDR, a.id, { nim: 10, tx: 't' })
  assert.ok(Date.parse(d.updatedAt) >= Date.parse(a.updatedAt))
  assert.equal(d.deposits.length, 1)
  assert.equal(d.deposits[0].nim, 10)
  assert.equal(d.payment, null)
  const { from, to } = moveNim(ADDR, a.id, b.id, 4)
  assert.ok(from.updatedAt && to.updatedAt)
  assert.equal(from.deposits.at(-1).nim, -4)
  assert.equal(to.deposits.at(-1).nim, 4)
})
