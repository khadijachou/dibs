import { test } from 'node:test'
import assert from 'node:assert/strict'

// cardChangePatch saves the brand preference in localStorage: a Map-backed stand-in for node.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const { canManageGoal, manageRows, unlockingForCard } = await import('./manage.js')
const { cardChangePatch } = await import('./availability.js')

const goal = (over = {}) => ({
  id: 'g', itemId: 'steam-usa-20', itemName: 'Steam gift card', itemDetail: '20 USD', usd: 22.48, targetNim: 90000,
  status: 'unlocking', deposits: [{ id: 'd1', nim: 90000, at: '2026-11-01T10:00:00Z' }],
  unlockSteps: [{ step: 'deactivate', tx: 'abc', at: '2026-11-11T10:00:00Z' }], ...over,
})

test('an unlocking goal for its card shows ⋯ with Change card only', () => {
  for (const g of [goal(), goal({ unlockMode: 'card' })]) {
    assert.equal(unlockingForCard(g), true)
    assert.equal(canManageGoal(g), true)
    assert.deepEqual(manageRows(g), ['change'])
  }
})

test('an unlocking goal to get the NIM back shows no ⋯', () => {
  const g = goal({ unlockMode: 'withdraw' })
  assert.equal(unlockingForCard(g), false)
  assert.equal(canManageGoal(g), false)
})

test('this goal\'s pending deposit or pay lock still closes ⋯ on an unlocking goal', () => {
  assert.equal(canManageGoal(goal(), { pending: true }), false)
  assert.equal(canManageGoal(goal(), { payLocked: true }), false)
})

test('saving and ready goals keep their rows', () => {
  assert.deepEqual(manageRows(goal({ status: 'saving', unlockSteps: [] })), ['change', 'move', 'back', 'delete'])
  assert.deepEqual(manageRows(goal({ status: 'ready' })), ['change', 'back', 'delete'])
})

test('Change card on an unlocking goal keeps status, unlockSteps, unlockMode and deposits; one more cardChanges entry', () => {
  const g = goal({ unlockMode: 'card', cardChanges: [{ itemId: 'older' }] })
  const patch = cardChangePatch(g, { item: { id: 'steam-eu-20', name: 'Steam gift card', detail: '20 EUR', usd: 23.9, faceValue: '20', region: 'EU' }, targetNim: 95000, brand: { key: 'steam', name: 'Steam' }, nimUsd: 0.00025 })
  for (const k of ['status', 'unlockSteps', 'unlockMode', 'deposits']) assert.ok(!(k in patch), k)
  const next = { ...g, ...patch }
  assert.equal(next.status, 'unlocking')
  assert.deepEqual(next.unlockSteps, g.unlockSteps)
  assert.deepEqual(next.deposits, g.deposits)
  assert.equal(next.cardChanges.length, g.cardChanges.length + 1)
  assert.equal(next.cardChanges.at(-1).itemId, 'steam-usa-20')
  assert.equal(next.itemId, 'steam-eu-20')
})
