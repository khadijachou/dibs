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
