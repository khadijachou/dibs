import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// A Map-backed localStorage stand-in, with Object.keys() listing the saved keys (as a browser does).
const store = new Map()
const api = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.localStorage = new Proxy(api, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)),
})

const { mergeGoalLists, moveGoalsOnce } = await import('./goalsMove.js')
const { adoptGoals, listGoals } = await import('./goals.js')

beforeEach(() => store.clear())

// --- The real phone (Copy diagnostics, 15 Nov): six keys, the same goals saved under rotated addresses. ---
const iso = (s) => new Date(s).toISOString()
const dep = (nim, at) => ({ id: `d-${nim}-${at}`, nim, at: iso(at) })
const steps = (n) => Array.from({ length: n }, (_, i) => ({ step: ['deactivate', 'retire', 'remove'][i], tx: `t${i}`, at: iso('2026-11-12T00:00:00Z') }))

// The four goals that must survive the merge (the named copies). Built once so every address can reuse the exact object.
const AIRBNB_1115 = { id: 'dfdf', itemId: 'airbnb-50', itemName: 'Airbnb', itemDetail: '50 USD', brandName: 'Airbnb', faceValue: '50', currency: 'USD', status: 'saving', deposits: [dep(3200, '2026-11-15T03:28:00Z')], unlockSteps: [], createdAt: iso('2026-11-10T00:00:00Z'), updatedAt: iso('2026-11-15T03:28:00Z') }
const VALORANT_19501 = { id: 'dd7c', itemId: 'valorant-5', itemName: 'Valorant', itemDetail: '5 EUR', brandName: 'Valorant', faceValue: '5', currency: 'EUR', status: 'saving', deposits: [dep(19501, '2026-11-12T17:48:00Z')], unlockSteps: [], createdAt: iso('2026-11-09T00:00:00Z'), updatedAt: iso('2026-11-12T17:48:00Z') }
const B61A_WITHDRAWN = { id: 'b61a', itemId: 'valorant-250', itemName: 'Valorant', itemDetail: '2.50 EUR', brandName: 'Valorant', faceValue: '2.50', currency: 'EUR', status: 'withdrawn', deposits: [], unlockSteps: steps(2), createdAt: iso('2026-11-08T00:00:00Z'), updatedAt: iso('2026-11-14T17:57:00Z') }
const C7A0_REDEEMED = { id: 'c7a0', itemId: 'steam-5', itemName: 'Steam', itemDetail: '5 USD', brandName: 'Steam', faceValue: '5', currency: 'USD', status: 'redeemed', deposits: [dep(22114, '2026-11-05T00:00:00Z')], unlockSteps: [], payment: { orderId: 'ord-c7a0', hash: 'hash-c7a0', at: iso('2026-11-10T19:31:00Z') }, createdAt: iso('2026-11-04T00:00:00Z'), updatedAt: iso('2026-11-10T19:31:00Z') }

// Other copies under the rotated addresses (older or smaller; the merge must not pick these).
const b61aReady = (at, n) => ({ ...B61A_WITHDRAWN, status: 'ready', deposits: [dep(11753, '2026-11-01T00:00:00Z')], unlockSteps: steps(n), updatedAt: iso(at) })
const b61aUnlocking = (at, n) => ({ ...B61A_WITHDRAWN, status: 'unlocking', deposits: [dep(11753, '2026-11-01T00:00:00Z')], unlockSteps: steps(n), updatedAt: iso(at) })
const dfdf3100 = { ...AIRBNB_1115, deposits: [dep(3100, '2026-11-13T14:41:00Z')], updatedAt: iso('2026-11-13T14:41:00Z') }
const dd7c2665 = { ...VALORANT_19501, deposits: [dep(2665, '2026-11-12T17:48:00Z')], updatedAt: iso('2026-11-12T17:48:00Z') }

const PHONE = {
  'dibs.goals.NQ91': [{ ...B61A_WITHDRAWN }, { ...C7A0_REDEEMED }, { ...VALORANT_19501 }, { ...AIRBNB_1115 }],
  'dibs.goals.NQ03': [b61aReady('2026-11-14T14:27:00Z', 2), { ...C7A0_REDEEMED }, { ...VALORANT_19501 }, dfdf3100],
  'dibs.goals.NQ45': [b61aUnlocking('2026-11-13T16:05:00Z', 0), { ...C7A0_REDEEMED }, { ...VALORANT_19501 }, dfdf3100],
  'dibs.goals.NQ79': [b61aReady('2026-11-12T14:55:00Z', 0), { ...C7A0_REDEEMED }, { ...VALORANT_19501 }, dfdf3100],
  'dibs.goals.NQ68': [b61aUnlocking('2026-11-12T14:55:00Z', 1), { ...C7A0_REDEEMED }, dd7c2665],
  'dibs.goals.NQ21': [{ ...C7A0_REDEEMED }],
}
const seedPhone = () => { for (const [k, v] of Object.entries(PHONE)) store.set(k, JSON.stringify(v)) }
const DELETED_6 = ['del-1', 'del-2', 'del-3', 'del-4', 'del-5', 'del-6']
const listsFromStore = () => [...store.keys()].filter((k) => k.startsWith('dibs.goals.')).map((k) => ({ address: k.slice('dibs.goals.'.length), goals: JSON.parse(store.get(k)) }))
const byId = (goals) => Object.fromEntries(goals.map((g) => [g.id, g]))

// (a) The AZIZ merge holds exactly the four named copies.
test('AZIZ: the merge holds exactly 4 goals, the named copies', () => {
  seedPhone()
  store.set('dibs.deleted', JSON.stringify(DELETED_6))
  const merged = mergeGoalLists({ lists: listsFromStore(), deleted: new Set(DELETED_6), current: 'NQ91' })
  assert.equal(merged.length, 4)
  const m = byId(merged)
  assert.deepEqual(m.dfdf, AIRBNB_1115)       // the 15 Nov copy, saving 3,200
  assert.deepEqual(m.dd7c, VALORANT_19501)    // the 12 Nov 17:48 copy with 19,501, not the 2,665 one
  assert.deepEqual(m.b61a, B61A_WITHDRAWN)    // the 14 Nov 17:57 copy, withdrawn 0
  assert.deepEqual(m.c7a0, C7A0_REDEEMED)     // Steam, redeemed
})

// (e) Equivalence: the merge gives the same goals as today's adoptGoals(NQ91) + listGoals(NQ91) on a copy of storage.
test('equivalence: mergeGoalLists matches adoptGoals(NQ91) + listGoals(NQ91)', () => {
  seedPhone()
  store.set('dibs.deleted', JSON.stringify(DELETED_6))
  const merged = mergeGoalLists({ lists: listsFromStore(), deleted: new Set(DELETED_6), current: 'NQ91' })
  adoptGoals('NQ91') // writes dibs.goals (the fixed key) by the same rules
  assert.deepEqual(merged, listGoals('NQ91'))
})

// (a) moveGoalsOnce writes dibs.goals once and marks the move.
test('moveGoalsOnce writes dibs.goals (4 goals) and sets the marker', () => {
  seedPhone()
  store.set('dibs.deleted', JSON.stringify(DELETED_6))
  moveGoalsOnce(localStorage, 'NQ91', Date.parse('2026-11-15T12:00:00Z'))
  const moved = JSON.parse(store.get('dibs.goals'))
  assert.equal(moved.length, 4)
  assert.deepEqual(byId(moved).dd7c, VALORANT_19501)
  assert.equal(store.get('dibs.goalsMoved'), iso('2026-11-15T12:00:00Z'))
})

// (b) The six old keys are byte for byte unchanged after the move.
test('the six old keys are byte for byte unchanged after the move', () => {
  seedPhone()
  const before = Object.fromEntries([...store.keys()].filter((k) => k.startsWith('dibs.goals.')).map((k) => [k, store.get(k)]))
  moveGoalsOnce(localStorage, 'NQ91', Date.parse('2026-11-15T12:00:00Z'))
  for (const [k, v] of Object.entries(before)) assert.equal(store.get(k), v, k)
})

// (c) A second call does nothing.
test('a second moveGoalsOnce does nothing (marker set, dibs.goals unchanged)', () => {
  seedPhone()
  moveGoalsOnce(localStorage, 'NQ91', Date.parse('2026-11-15T12:00:00Z'))
  const after1 = store.get('dibs.goals')
  const marker1 = store.get('dibs.goalsMoved')
  // change nothing but call again with a different now: must not rewrite
  moveGoalsOnce(localStorage, 'NQ91', Date.parse('2026-11-16T12:00:00Z'))
  assert.equal(store.get('dibs.goals'), after1)
  assert.equal(store.get('dibs.goalsMoved'), marker1)
})

// (d) A phone with one address.
test('one address: the move keeps its goals', () => {
  store.set('dibs.goals.NQ91', JSON.stringify([{ ...AIRBNB_1115 }, { ...VALORANT_19501 }]))
  moveGoalsOnce(localStorage, 'NQ91', Date.parse('2026-11-15T12:00:00Z'))
  assert.deepEqual(byId(JSON.parse(store.get('dibs.goals'))), byId([AIRBNB_1115, VALORANT_19501]))
})

// (d) A phone with no goals.
test('no goals: dibs.goals is [] and the marker is set', () => {
  moveGoalsOnce(localStorage, 'NQ91', Date.parse('2026-11-15T12:00:00Z'))
  assert.deepEqual(JSON.parse(store.get('dibs.goals')), [])
  assert.equal(store.get('dibs.goalsMoved'), iso('2026-11-15T12:00:00Z'))
})

// (d) A deleted goal present under an old key stays out.
test('a deleted goal under an old key stays out of the merge', () => {
  store.set('dibs.goals.NQ91', JSON.stringify([{ ...AIRBNB_1115 }]))
  store.set('dibs.goals.NQ03', JSON.stringify([{ ...VALORANT_19501 }]))
  store.set('dibs.deleted', JSON.stringify(['dd7c']))
  moveGoalsOnce(localStorage, 'NQ91', Date.parse('2026-11-15T12:00:00Z'))
  const moved = JSON.parse(store.get('dibs.goals'))
  assert.deepEqual(moved.map((g) => g.id), ['dfdf'])
})

// (d) Storage that throws: no write, no throw.
test('storage that throws: no write, no throw', () => {
  const bad = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => {} }
  assert.doesNotThrow(() => moveGoalsOnce(bad, 'NQ91', 0))
})

// If dibs.goals already exists without the marker, keep it as the base and merge the old keys into it.
test('existing dibs.goals without a marker is kept as the base', () => {
  store.set('dibs.goals', JSON.stringify([{ ...AIRBNB_1115 }]))
  store.set('dibs.goals.NQ03', JSON.stringify([{ ...VALORANT_19501 }]))
  moveGoalsOnce(localStorage, 'NQ91', Date.parse('2026-11-15T12:00:00Z'))
  const moved = byId(JSON.parse(store.get('dibs.goals')))
  assert.deepEqual(moved.dfdf, AIRBNB_1115)
  assert.deepEqual(moved.dd7c, VALORANT_19501)
})
