// lib/unlockFlow.js: getUnlockState's wallet rule and settleGoal's step records (v1.1.9). The chain reads are passed
// in (the io argument), so nothing here talks to Nimiq Pay or the RPC.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = new Proxy({
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)),
})

const { getUnlockState, settleGoal } = await import('./unlockFlow.js')
const { getGoal, updateGoal, createGoal } = await import('./goals.js')

const L = 100_000
const ADDR = 'NQ00 TEST'
const ITEM = { id: 'steam-50', name: 'Steam gift card', detail: '50 USD', usd: 55 }
const make = (patch) => { const g = createGoal(ADDR, { item: ITEM, targetNim: 11_753, deadline: '2027-01-01' }); return updateGoal(ADDR, g.id, patch) }
const io = ({ wallet = 0, active = 22_168, inactive = 0, retired = 0, inactiveFrom, block = 1 } = {}) => ({
  walletNim: async () => wallet,
  getBlockNumber: async () => block,
  readStaker: async () => ({ balance: active * L, inactiveBalance: inactive * L, retiredBalance: retired * L, ...(inactiveFrom ? { inactiveFrom } : {}) }),
  isDemo: () => false,
})
const STEPS3 = [{ step: 'deactivate', tx: 'a', at: '2026-11-12T03:00:00Z' }, { step: 'retire', tx: 'b', at: '2026-11-12T15:00:00Z' }, { step: 'remove', tx: 'c', at: '2026-11-12T15:01:00Z' }]
const deps = (nim) => [{ id: 'd', nim, at: '2026-11-01T00:00:00Z' }]

beforeEach(() => store.clear())

test('a null wallet read for a started goal throws (pause, never guess)', async () => {
  for (const status of ['unlocking', 'ready']) {
    const g = make({ status, deposits: deps(11_753) })
    await assert.rejects(getUnlockState(g, ADDR, io({ wallet: null })), /Wallet balance unreadable/, status)
  }
})

test('a null wallet read with NIM inactive or retired does not throw: the chain decides (waiting, ready, remove)', async () => {
  const g = make({ status: 'unlocking', deposits: deps(11_753) })
  const waiting = await getUnlockState(g, ADDR, io({ wallet: null, active: 10_415, inactive: 11_753, inactiveFrom: 66_441_600, block: 66_450_000 }))
  assert.equal(waiting.state, 'waiting')
  const ready = await getUnlockState(g, ADDR, io({ wallet: null, active: 10_415, inactive: 11_753, inactiveFrom: 66_441_600, block: 66_488_963 }))
  assert.equal(ready.state, 'ready')
  const remove = await getUnlockState(g, ADDR, io({ wallet: null, active: 10_415, retired: 11_753 }))
  assert.equal(remove.state, 'remove')
  for (const us of [waiting, ready, remove]) assert.equal(us.walletNim, 0)
})

test('a null wallet read with nothing leaving still throws for a started goal (no staker too)', async () => {
  const g = make({ status: 'unlocking', deposits: deps(11_753) })
  await assert.rejects(getUnlockState(g, ADDR, io({ wallet: null, active: 22_168 })), /Wallet balance unreadable/)
  const none = { ...io({ wallet: null }), readStaker: async () => null }
  await assert.rejects(getUnlockState(g, ADDR, none), /Wallet balance unreadable/)
})

test('a null wallet read for a goal not started does not throw (reads the wallet as 0, as before)', async () => {
  const g = make({ status: 'saving', deposits: deps(11_753) })
  const us = await getUnlockState(g, ADDR, io({ wallet: null, active: 11_753 }))
  assert.equal(us.state, 'stake')
  assert.equal(us.walletNim, 0)
  assert.equal(us.finished, false)
})

test('the incident through getUnlockState: ready goal, others 19,503 saving, active 22,168 -> short and finished', async () => {
  make({ status: 'saving', deposits: deps(19_503) })
  const g = make({ status: 'ready', deposits: deps(11_753), unlockSteps: STEPS3 })
  const us = await getUnlockState(g, ADDR, io({ wallet: 0 }))
  assert.equal(us.state, 'stake')
  assert.equal(us.short, true)
  assert.equal(us.finished, true)
  // With the wallet read right, the same goal is 'pay'.
  assert.equal((await getUnlockState(g, ADDR, io({ wallet: 12_392 }))).state, 'pay')
})

test('settleGoal: a ready goal with its 3 steps and state stake keeps its steps and stays ready', () => {
  const g = make({ status: 'ready', deposits: deps(11_753), unlockSteps: STEPS3 })
  const { goal, outcome } = settleGoal(ADDR, g, { state: 'stake' })
  assert.equal(outcome, null)
  assert.equal(goal.status, 'ready')
  assert.deepEqual(goal.unlockSteps, STEPS3)
  assert.deepEqual(getGoal(ADDR, g.id).unlockSteps, STEPS3)
})

test('settleGoal: an unlocking goal with a remove entry keeps its steps on stake', () => {
  const g = make({ status: 'unlocking', deposits: deps(11_753), unlockSteps: STEPS3 })
  const { goal } = settleGoal(ADDR, g, { state: 'stake' })
  assert.equal(goal.status, 'unlocking')
  assert.deepEqual(goal.unlockSteps, STEPS3)
})

test('settleGoal: the other cases are unchanged', () => {
  // Unlocking without a remove, state stake: steps cleared, status kept (as before).
  let g = make({ status: 'unlocking', deposits: deps(100), unlockSteps: [STEPS3[0]] })
  let r = settleGoal(ADDR, g, { state: 'stake' })
  assert.deepEqual(r.goal.unlockSteps, [])
  assert.equal(r.goal.status, 'unlocking')
  // Unlocking (card) + pay -> ready, outcome ready, the 3 steps kept.
  g = make({ status: 'unlocking', deposits: deps(100), unlockSteps: STEPS3 })
  r = settleGoal(ADDR, g, { state: 'pay' })
  assert.equal(r.outcome, 'ready')
  assert.equal(r.goal.status, 'ready')
  assert.deepEqual(r.goal.unlockSteps, STEPS3)
  // Unlocking (withdraw) + pay -> withdrawn, a negative withdraw entry.
  g = make({ status: 'unlocking', unlockMode: 'withdraw', deposits: deps(100), unlockSteps: STEPS3 })
  r = settleGoal(ADDR, g, { state: 'pay' })
  assert.equal(r.outcome, 'withdrawn')
  assert.equal(r.goal.status, 'withdrawn')
  assert.equal(r.goal.deposits.at(-1).nim, -100)
  // Ready + waiting / ready / remove -> unlocking, steps filtered to what the chain shows.
  for (const [s, kept] of [['waiting', ['deactivate']], ['ready', ['deactivate']], ['remove', ['deactivate', 'retire']]]) {
    g = make({ status: 'ready', deposits: deps(100), unlockSteps: STEPS3 })
    r = settleGoal(ADDR, g, { state: s })
    assert.equal(r.goal.status, 'unlocking', s)
    assert.deepEqual(r.goal.unlockSteps.map((x) => x.step), kept, s)
  }
  // Saving at 100% + waiting, no other unlock -> unlocking (step 1 sent from the Lab).
  store.clear()
  g = make({ status: 'saving', deposits: deps(11_753) })
  r = settleGoal(ADDR, g, { state: 'waiting' })
  assert.equal(r.goal.status, 'unlocking')
  // Nothing to change: same goal object back.
  g = make({ status: 'saving', deposits: deps(10) })
  r = settleGoal(ADDR, g, { state: 'stake' })
  assert.equal(r.goal, g)
})
