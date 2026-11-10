import { test } from 'node:test'
import assert from 'node:assert/strict'
import { amountFor, sendGated, unlockStateOf } from './unlock.js'

const L = 100_000 // luna per NIM
const st = (active, inactive, retired, extra = {}) => ({ balance: active * L, inactiveBalance: inactive * L, retiredBalance: retired * L, ...extra })
const GOAL = 22_801
const base = { goalNim: GOAL, walletNim: 0, started: true, now: 0 }

test('a) inactive 22,801, inactiveFrom 66,441,600, block 66,450,000 -> waiting, releaseBlock 66,484,801', () => {
  const us = unlockStateOf({ ...base, staker: st(0, GOAL, 0, { inactiveFrom: 66_441_600 }), block: 66_450_000 })
  assert.equal(us.state, 'waiting')
  assert.equal(us.releaseBlock, 66_484_801)
  assert.equal(us.block, 66_450_000)
  assert.equal(us.releaseAt, (66_484_801 - 66_450_000) * 1000) // 34,801 blocks at 1 s: 9 h 40 min
})

test('a2) the 9 Nov Retire block 66,417,597 -> waiting too', () => {
  assert.equal(unlockStateOf({ ...base, staker: st(0, GOAL, 0, { inactiveFrom: 66_441_600 }), block: 66_417_597 }).state, 'waiting')
})

test('b) same staker, block 66,488,963 -> ready (and exactly at the release block)', () => {
  const s = st(0, GOAL, 0, { inactiveFrom: 66_441_600 })
  assert.equal(unlockStateOf({ ...base, staker: s, block: 66_488_963 }).state, 'ready')
  assert.equal(unlockStateOf({ ...base, staker: s, block: 66_484_801 }).state, 'ready')
  assert.equal(unlockStateOf({ ...base, staker: s, block: 66_484_800 }).state, 'waiting')
})

test('c) retired 22,801 -> remove', () => {
  assert.equal(unlockStateOf({ ...base, staker: st(0, 0, GOAL), block: 66_490_000 }).state, 'remove')
})

test('d) active 1,362, inactive 0, retired 0, wallet >= price -> pay (other NIM may stay staked)', () => {
  const us = unlockStateOf({ ...base, staker: st(1_362, 0, 0), block: 66_500_000, walletNim: 22_900 })
  assert.equal(us.state, 'pay')
})

test('stake: goal NIM still active, or the unlock not started', () => {
  assert.equal(unlockStateOf({ ...base, staker: st(GOAL + 1_362, 0, 0), block: 1, walletNim: 50_000 }).state, 'stake')
  assert.equal(unlockStateOf({ ...base, started: false, staker: st(1_362, 0, 0), block: 1, walletNim: 50_000 }).state, 'stake')
  // Other saving goals keep their NIM active: still counts as this goal's NIM being active.
  assert.equal(unlockStateOf({ ...base, staker: st(500 + 300, 0, 0), goalNim: 300, othersNim: 500, block: 1, walletNim: 900 }).state, 'stake')
  assert.equal(unlockStateOf({ ...base, staker: st(500, 0, 0), goalNim: 300, othersNim: 500, block: 1, walletNim: 900 }).state, 'pay')
})

test('cannot decide -> throws, never guesses', () => {
  assert.throws(() => unlockStateOf({ ...base, staker: st(0, GOAL, 0), block: 66_450_000 })) // no inactiveFrom
  assert.throws(() => unlockStateOf({ ...base, staker: st(0, GOAL, 0, { inactiveFrom: 66_441_600 }), block: NaN }))
  assert.equal(unlockStateOf({ ...base, demo: true, staker: st(0, GOAL, 0), block: 5 }).state, 'ready')
})

test('amounts from the chain only', () => {
  const stake = (active) => unlockStateOf({ ...base, staker: st(active, 0, 0), block: 1 })
  assert.equal(amountFor('deactivate', stake(GOAL + 1_362)), 1_362 * L) // active - goal
  assert.equal(amountFor('deactivate', stake(GOAL + 50)), 0) // rest under 100 NIM -> 0
  assert.equal(amountFor('deactivate', stake(GOAL)), 0)
  assert.equal(amountFor('deactivate', stake(100)), null) // short: does not hold the goal
  const ready = (inactive) => unlockStateOf({ ...base, staker: st(0, inactive, 0, { inactiveFrom: 100 }), block: 100_000 })
  assert.equal(amountFor('retire', ready(GOAL + 500)), GOAL * L)
  assert.equal(amountFor('retire', ready(20_000)), 20_000 * L) // never more than inactive
  const rem = unlockStateOf({ ...base, staker: st(0, 0, GOAL + 7), block: 1 })
  assert.equal(amountFor('remove', rem), (GOAL + 7) * L) // the whole retired balance
  // Wrong state: no amount, so nothing can be sent.
  assert.equal(amountFor('retire', unlockStateOf({ ...base, staker: st(0, GOAL, 0, { inactiveFrom: 66_441_600 }), block: 66_450_000 })), null)
  assert.equal(amountFor('remove', ready(GOAL)), null)
})

test('gate: Retire while waiting never calls Nimiq Pay', async () => {
  const waiting = unlockStateOf({ ...base, staker: st(0, GOAL, 0, { inactiveFrom: 66_441_600 }), block: 66_450_000 })
  let calls = 0
  await assert.rejects(
    sendGated('retire', { readState: async () => waiting, send: async () => { calls++; return 'hash' } }),
    (e) => e.gate?.us.state === 'waiting' && e.gate.step === 'retire',
  )
  await assert.rejects(sendGated('remove', { readState: async () => waiting, send: async () => { calls++ } }), (e) => Boolean(e.gate))
  assert.equal(calls, 0)
})

test('gate: Retire when ready sends min(goal, inactive) once', async () => {
  const ready = unlockStateOf({ ...base, staker: st(0, GOAL, 0, { inactiveFrom: 66_441_600 }), block: 66_488_963 })
  const sent = []
  const r = await sendGated('retire', { readState: async () => ready, send: async (step, luna) => { sent.push([step, luna]); return 'h' } })
  assert.deepEqual(sent, [['retire', GOAL * L]])
  assert.equal(r.tx, 'h')
})

// ?sim=UNL_WAITING in the demo wallet: Stop staking gives a release 12 h away, the state reads "waiting",
// the gate keeps Nimiq Pay closed, and a raw early Retire (Lab) is included but refused (executionResult false).
test('sim UNL_WAITING: demo wallet waits 12 h, gate blocks, raw Retire is refused', async () => {
  const store = new Map([['dibs.simulate', 'UNL_WAITING']])
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
  const { createMockProvider } = await import('./mockProvider.js')
  const p = createMockProvider()
  await p.sendNewStakerTransaction({ delegation: 'NQ00', value: (GOAL + 1_362) * L })
  await p.sendSetActiveStakeTransaction({ newActiveBalance: 1_362 * L })
  const read = async () => unlockStateOf({ ...base, now: Date.now(), demo: true, staker: p.mockStaker(), block: await p.getBlockNumber(), walletNim: 0 })
  const us = await read()
  assert.equal(us.state, 'waiting')
  assert.ok(us.releaseAt - Date.now() > 11.9 * 3600_000)
  let opened = 0
  const send = async (step, luna) => { opened++; return p.sendRetireStakeTransaction({ retireStake: luna }) }
  await assert.rejects(sendGated('retire', { readState: read, send }), (e) => e.gate?.us.state === 'waiting')
  assert.equal(opened, 0)
  const hash = await p.sendRetireStakeTransaction({ retireStake: GOAL * L })
  const tx = (await p.request({ method: 'getTransactionByHash', params: [hash] })).data
  assert.equal(tx.executionResult, false)
  assert.equal(p.mockStaker().inactiveBalance, GOAL * L) // nothing moved
})
