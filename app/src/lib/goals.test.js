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
