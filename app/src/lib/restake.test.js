// Put missing NIM back in staking (lib/restake.js). The pure parts, and the two wrappers with the chain and the wallet
// stubbed. The chain is the only judge, as for deposits, and no deposit is recorded and no goal changes.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Map-backed localStorage stand-in. Object.keys(localStorage) lists the stored keys, as in a browser.
const store = new Map()
const ls = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.localStorage = new Proxy(ls, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined),
})

const { restakeAmount, isRestake, restakeOutcome, startRestake, settleRestake } = await import('./restake.js')
const { pending } = await import('./deposit.js')

const LUNA = 100_000
const ADDR = 'NQ11 TEST'
// A staker holding `nim` NIM, all active. stakeGap and stakedLuna read balance/inactiveBalance/retiredBalance.
const staker = (nim) => ({ balance: nim * LUNA, inactiveBalance: 0, retiredBalance: 0, address: ADDR })
// Goals counting `nim` NIM, still saving (so stakeGap counts them).
const savingGoals = (...nims) => nims.map((n, i) => ({ id: `g${i}`, status: 'saving', deposits: [{ id: `d${i}`, nim: n }] }))

beforeEach(() => store.clear())

test('restakeAmount: the whole gap (rounded up) capped by the floored free wallet NIM, null when there is nothing to do', () => {
  assert.equal(restakeAmount({ gapExact: 9078.6, free: 17445 }), 9079) // exact gap rounds up, fits in the wallet
  assert.equal(restakeAmount({ gapExact: 9078.0, free: 17445 }), 9078) // a whole gap stays whole (epsilon)
  assert.equal(restakeAmount({ gapExact: 1.2, free: 17445 }), 2) // rounds up to 2
  assert.equal(restakeAmount({ gapExact: 9078, free: 5000.7 }), 5000) // wallet is the cap, floored
  assert.equal(restakeAmount({ gapExact: 9078, free: 0.9 }), null) // under 1 NIM free
  assert.equal(restakeAmount({ gapExact: null, free: 17445 }), null) // chain unknown
  assert.equal(restakeAmount({ gapExact: 9078, free: null }), null) // wallet unknown
})

test('isRestake only for a record marked kind restake', () => {
  assert.equal(isRestake({ kind: 'restake' }), true)
  assert.equal(isRestake({ goalId: 'g1' }), false) // a deposit
  assert.equal(isRestake(null), false)
})

test('restakeOutcome: the chain decides, failed only on a passed deadline or the give-up', () => {
  const p = { nim: 9078, beforeLuna: 13623 * LUNA, at: Date.now(), deadline: Date.now() + 10_000, walletError: null }
  assert.equal(restakeOutcome(p, staker(13623 + 9078), Date.now()), 'landed')
  assert.equal(restakeOutcome(p, staker(13623), Date.now()), 'wait') // no growth yet, deadline ahead
  assert.equal(restakeOutcome({ ...p, walletError: 'GENERIC' }, staker(13623), Date.now() + 20_000), 'failed') // errored and past the deadline
  assert.equal(restakeOutcome({ ...p, at: Date.now() - 11 * 60_000 }, staker(13623), Date.now()), 'failed') // give-up (10 min)
})

// startRestake: the chain and the wallet are stubbed; stakeNim records its calls.
function stubs({ st = staker(13623), wallet = 17445, throwStaker = false, stake } = {}) {
  const calls = []
  return {
    calls,
    address: ADDR,
    goals: savingGoals(22701), // inGoals 22701, staked 13623 -> gap 9078
    readStaker: async () => { if (throwStaker) throw new Error('rpc'); return st },
    readWallet: async () => wallet,
    stakeNim: stake || (async (args) => { calls.push(args); return { hash: 'HASH123' } }),
  }
}

test('startRestake refuses when a deposit is already pending', async () => {
  pending.set({ v: 2, id: 'dep-1', address: ADDR, goalId: 'g1', nim: 100 })
  const s = stubs()
  const r = await startRestake(s)
  assert.deepEqual(r, { ok: false, why: 'pending' })
  assert.equal(s.calls.length, 0) // nothing sent
})

test('startRestake refuses while an unlock is settling (settlingOf judged from the fresh read)', async () => {
  const s = stubs()
  const r = await startRestake({ ...s, settlingOf: () => true }) // a tap during a settling unlock sends nothing
  assert.deepEqual(r, { ok: false, why: 'settling' })
  assert.equal(s.calls.length, 0)
})

test('startRestake refuses with no staker (S1: never a new staker)', async () => {
  const s = stubs({ st: null })
  const r = await startRestake(s)
  assert.deepEqual(r, { ok: false, why: 'staker' })
  assert.equal(s.calls.length, 0)
  assert.equal(pending.get(ADDR), null) // no lock left
})

test('startRestake refuses when the staker read throws (pause, never guess)', async () => {
  const s = stubs({ throwStaker: true })
  const r = await startRestake(s)
  assert.deepEqual(r, { ok: false, why: 'staker' })
  assert.equal(s.calls.length, 0)
})

test('startRestake sends exactly one add-stake for the gap, locked as a restake', async () => {
  const s = stubs()
  const r = await startRestake(s)
  assert.deepEqual(r, { ok: true, amount: 9078 })
  assert.equal(s.calls.length, 1)
  assert.deepEqual(s.calls[0], { nim: 9078, hasStaker: true }) // S1: always hasStaker, S2: the fresh gap
  const p = pending.get(ADDR)
  assert.equal(p.kind, 'restake')
  assert.equal(p.goalId, null)
  assert.equal(p.nim, 9078)
  assert.equal(p.beforeLuna, 13623 * LUNA) // from the fresh read, not a rendered figure
  assert.equal(p.newStaker, false)
  assert.equal(p.tx, 'HASH123')
  assert.ok(p.deadline > Date.now())
})

test('startRestake after a wallet error keeps the lock and records the error', async () => {
  const s = stubs({ stake: async () => { const e = new Error('x'); e.type = 'SOMETHING_NEW'; throw e } })
  const r = await startRestake(s)
  assert.deepEqual(r, { ok: true, amount: 9078 })
  const p = pending.get(ADDR)
  assert.equal(p.kind, 'restake')
  assert.equal(p.walletError, 'GENERIC') // classify(e, 'deposit')
  assert.ok(p.deadline > Date.now()) // the short give-up deposits use after an error
})

test('startRestake rounds the gap up to a whole number (13,622.4 staked, 22,701 in goals -> 9,079)', async () => {
  const s = stubs({ st: staker(13622.4) }) // exact gap 9,078.6
  const r = await startRestake(s)
  assert.deepEqual(r, { ok: true, amount: 9079 })
  assert.deepEqual(s.calls[0], { nim: 9079, hasStaker: true })
})

test('startRestake caps the amount at the free wallet NIM', async () => {
  const s = stubs({ wallet: 5000 })
  const r = await startRestake(s)
  assert.deepEqual(r, { ok: true, amount: 5000 })
  assert.deepEqual(s.calls[0], { nim: 5000, hasStaker: true })
})

test('settleRestake: the staker grew by the amount -> landed, lock cleared, one log entry', async () => {
  await startRestake(stubs())
  const r = await settleRestake({ address: ADDR, readStaker: async () => staker(13623 + 9078), now: 1000 })
  assert.deepEqual(r, { state: 'landed', nim: 9078 })
  assert.equal(pending.get(ADDR), null)
  const log = JSON.parse(localStorage.getItem('dibs.restakes'))
  assert.equal(log.length, 1)
  assert.equal(log[0].nim, 9078)
  assert.equal(log[0].at, 1000)
})

test('settleRestake landed is idempotent by lock id: a second settle of the same lock never doubles the log', async () => {
  await startRestake(stubs())
  const lockId = pending.get(ADDR).id
  await settleRestake({ address: ADDR, readStaker: async () => staker(13622 + 9078), now: 1000 })
  // Re-seed the same lock (as a racing second watcher would still see it) and settle again.
  pending.set({ v: 2, id: lockId, address: ADDR, goalId: null, kind: 'restake', nim: 9078, beforeLuna: 13623 * LUNA, at: Date.now(), deadline: Date.now() + 10_000 })
  await settleRestake({ address: ADDR, readStaker: async () => staker(13623 + 9078), now: 2000 })
  assert.equal(JSON.parse(localStorage.getItem('dibs.restakes')).length, 1) // still one entry
})

test('settleRestake: grew by less than the amount -> wait, lock kept', async () => {
  await startRestake(stubs())
  const r = await settleRestake({ address: ADDR, readStaker: async () => staker(13623 + 10) })
  assert.deepEqual(r, { state: 'wait' })
  assert.ok(isRestake(pending.get(ADDR))) // still waiting
  assert.equal(localStorage.getItem('dibs.restakes'), null) // nothing logged
})

test('settleRestake: errored and past the deadline -> failed, lock cleared', async () => {
  pending.set({ v: 2, id: 'r1', address: ADDR, goalId: null, kind: 'restake', nim: 9078, beforeLuna: 13623 * LUNA, at: Date.now(), walletError: 'GENERIC', deadline: 500 })
  const r = await settleRestake({ address: ADDR, readStaker: async () => staker(13623), now: 1000 })
  assert.deepEqual(r, { state: 'failed', error: 'GENERIC' })
  assert.equal(pending.get(ADDR), null)
})

test('settleRestake: past the 10 min give-up -> failed', async () => {
  pending.set({ v: 2, id: 'r1', address: ADDR, goalId: null, kind: 'restake', nim: 9078, beforeLuna: 13623 * LUNA, at: Date.now() - 11 * 60_000, walletError: null, deadline: Date.now() + 1000 })
  const r = await settleRestake({ address: ADDR, readStaker: async () => staker(13623) })
  assert.equal(r.state, 'failed')
  assert.equal(r.error, 'unseen')
  assert.equal(pending.get(ADDR), null)
})

test('settleRestake: a deposit record (no kind) is ignored and left in place', async () => {
  const dep = { v: 2, id: 'dep-9', address: ADDR, goalId: 'g1', nim: 100, beforeLuna: 0 }
  pending.set(dep)
  const r = await settleRestake({ address: ADDR, readStaker: async () => { throw new Error('should not be read') } })
  assert.deepEqual(r, { state: 'none' })
  assert.deepEqual(pending.get(ADDR), dep) // untouched
})

test('S3: a restake records no deposit and changes no goal (dibs.goals byte for byte unchanged)', async () => {
  const goals = savingGoals(12000, 10701) // two saving goals, 22,701 together
  localStorage.setItem('dibs.goals', JSON.stringify(goals))
  const before = localStorage.getItem('dibs.goals')
  const s = { address: ADDR, goals, readStaker: async () => staker(13623), readWallet: async () => 17445, stakeNim: async () => ({ hash: 'H' }) }
  await startRestake(s)
  await settleRestake({ address: ADDR, readStaker: async () => staker(13623 + 9078) })
  assert.equal(localStorage.getItem('dibs.goals'), before) // not one byte moved
  const after = JSON.parse(localStorage.getItem('dibs.goals'))
  assert.deepEqual(after.map((g) => g.deposits.length), [1, 1]) // no goal gained a deposit
})

test('restake.js never imports the ledger writers (addDeposit, updateGoal, confirmPending, createGoal)', () => {
  const src = readFileSync(new URL('./restake.js', import.meta.url), 'utf8')
  for (const name of ['addDeposit', 'updateGoal', 'confirmPending', 'createGoal']) {
    assert.ok(!src.includes(name), `restake.js must not reference ${name}`)
  }
})
