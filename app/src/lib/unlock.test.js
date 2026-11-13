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

// v1.1.9, mainnet 13 Nov: a goal that had finished its unlock read 'stake' again and Stop staking took 11,753 NIM
// from the stake behind the other goals. The incident's exact numbers.
const INC = { goalNim: 11_753, othersNim: 19_503, started: true, walletNim: 0, block: 1, now: 0 }

test('v1.1.9 incident: active 22,168, goal 11,753, others 19,503 -> short, no amount, gate never sends', async () => {
  const us = unlockStateOf({ ...INC, staker: st(22_168, 0, 0) })
  assert.equal(us.state, 'stake')
  assert.equal(us.short, true)
  assert.equal(amountFor('deactivate', us), null)
  let calls = 0
  await assert.rejects(
    sendGated('deactivate', { readState: async () => us, send: async () => { calls++; return 'hash' } }),
    (e) => e.gate?.step === 'deactivate' && e.gate.us === us,
  )
  assert.equal(calls, 0)
})

test('v1.1.9 finished goal: outside stake larger than the goal still never deactivates', async () => {
  // active covers goal + others + 15,000 NIM outside Dibs: not short, but the goal already finished its unlock.
  const us = unlockStateOf({ ...INC, finished: true, staker: st(11_753 + 19_503 + 15_000, 0, 0) })
  assert.equal(us.state, 'stake')
  assert.equal(us.short, false)
  assert.equal(amountFor('deactivate', us), null)
  let calls = 0
  await assert.rejects(sendGated('deactivate', { readState: async () => us, send: async () => { calls++ } }), (e) => Boolean(e.gate))
  assert.equal(calls, 0)
})

test('v1.1.9 tolerance: the stake 1 NIM under the ledger (rounding) still allows step 1; more than 1 NIM does not', () => {
  const at = (active) => unlockStateOf({ ...INC, started: false, staker: { balance: active } })
  const need = (11_753 + 19_503) * L
  assert.equal(amountFor('deactivate', at(need - L)), 19_503 * L - L) // same formula as before: active - goal
  assert.equal(amountFor('deactivate', at(need - L - 1)), null)
})

// The rule before v1.1.9, for the regression checks: same amounts whenever step 1 is allowed.
const oldDeactivate = (active, goalNim) => { const rest = active - goalNim * L; return active < goalNim * L ? null : rest < 100 * L ? 0 : rest }

test('v1.1.9 regression: a saving goal at 100% with active = goal + others + rewards, same amount as before', () => {
  for (const [goalNim, othersNim, rewards] of [[11_753, 19_503, 2_665], [22_801, 0, 1_362], [300, 500, 0.5], [5_000, 1_000, 0]]) {
    const active = (goalNim + othersNim + rewards) * L
    const us = unlockStateOf({ goalNim, othersNim, walletNim: 0, started: false, block: 1, now: 0, staker: { balance: active } })
    assert.equal(us.short, false, `${goalNim}/${othersNim}`)
    const a = amountFor('deactivate', us)
    assert.equal(a, oldDeactivate(active, goalNim), `${goalNim}/${othersNim}`)
    assert.equal(a, (othersNim + rewards) * L >= 100 * L ? (othersNim + rewards) * L : 0)
  }
})

test('v1.1.9 regression: a single goal with no others, and a rest under 100 NIM going to 0', () => {
  const one = (active) => unlockStateOf({ goalNim: GOAL, walletNim: 0, started: false, block: 1, now: 0, staker: st(active, 0, 0) })
  assert.equal(amountFor('deactivate', one(GOAL + 1_362)), 1_362 * L)
  assert.equal(amountFor('deactivate', one(GOAL + 99)), 0)
  assert.equal(amountFor('deactivate', one(GOAL)), 0)
  assert.equal(amountFor('deactivate', one(GOAL - 0.5)), null) // under the goal: refused, as before (no tolerance here)
  // With others: a rest under 100 NIM still goes to 0.
  const us = unlockStateOf({ goalNim: 1_000, othersNim: 50, walletNim: 0, started: false, block: 1, now: 0, staker: st(1_050, 0, 0) })
  assert.equal(amountFor('deactivate', us), 0)
})

test('v1.1.9 regression: retire and remove amounts unchanged in waiting, ready and remove, finished or not', () => {
  for (const extra of [{}, { finished: true }, { othersNim: 19_503 }]) {
    const b = { ...base, ...extra }
    const waiting = unlockStateOf({ ...b, staker: st(0, GOAL, 0, { inactiveFrom: 66_441_600 }), block: 66_450_000 })
    assert.equal(waiting.state, 'waiting')
    assert.equal(amountFor('retire', waiting), null)
    assert.equal(amountFor('remove', waiting), null)
    const ready = (inactive) => unlockStateOf({ ...b, staker: st(0, inactive, 0, { inactiveFrom: 100 }), block: 100_000 })
    assert.equal(amountFor('retire', ready(GOAL + 500)), GOAL * L)
    assert.equal(amountFor('retire', ready(20_000)), 20_000 * L)
    const rem = unlockStateOf({ ...b, staker: st(0, 0, GOAL + 7), block: 1 })
    assert.equal(amountFor('remove', rem), (GOAL + 7) * L)
    assert.equal(amountFor('deactivate', rem), null)
  }
})
