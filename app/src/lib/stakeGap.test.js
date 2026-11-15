import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stakeGap, stakeGapExact } from './stakeGap.js'

const L = 100_000
const g = (status, nim) => ({ status, deposits: [{ nim }] })
// Aziz's real phone (15 Nov): two saving goals count 22,701 NIM, the chain holds 13,622 active, 0 inactive.
const AZIZ_GOALS = [g('saving', 3200), g('saving', 19501)]
const st = (active, inactive = 0, retired = 0) => ({ balance: active * L, inactiveBalance: inactive * L, retiredBalance: retired * L })

test('Aziz: 22,701 in goals, 13,622 active, 0 inactive -> gap 9,079', () => {
  assert.equal(stakeGap({ st: st(13622), goals: AZIZ_GOALS }), 9079)
})

test('a gap under 1 NIM is null (0.6 NIM)', () => {
  assert.equal(stakeGap({ st: st(100), goals: [g('saving', 100.6)] }), null)
})

test('settling gives null', () => {
  assert.equal(stakeGap({ st: st(13622), goals: AZIZ_GOALS, settling: true }), null)
})

test('a pending deposit gives null', () => {
  assert.equal(stakeGap({ st: st(13622), goals: AZIZ_GOALS, pendingDeposit: true }), null)
})

test('st null gives null', () => {
  assert.equal(stakeGap({ st: null, goals: AZIZ_GOALS }), null)
})

test('an unlocking goal counts in inGoals, and inactive counts as staked', () => {
  // 10,000 saving + 5,000 unlocking = 15,000 in goals; 8,000 active + 2,000 inactive = 10,000 staked -> gap 5,000.
  assert.equal(stakeGap({ st: st(8000, 2000), goals: [g('saving', 10000), g('unlocking', 5000)] }), 5000)
})

test('retired counts as staked: mid-unlock (retired between Retire and Remove) shows no false gap', () => {
  // 40,000 unlocking (retired on chain) + 20,000 saving (active) = 60,000 in goals; 20,000 active + 40,000 retired = 60,000 staked -> null.
  assert.equal(stakeGap({ st: st(20000, 0, 40000), goals: [g('unlocking', 40000), g('saving', 20000)] }), null)
})

test('retired counts as staked: a real gap still shows', () => {
  // 70,000 in goals; 20,000 active + 40,000 retired = 60,000 staked -> gap 10,000.
  assert.equal(stakeGap({ st: st(20000, 0, 40000), goals: [g('unlocking', 40000), g('saving', 30000)] }), 10000)
})

test('reads st.activeBalance too (not only st.balance)', () => {
  assert.equal(stakeGap({ st: { activeBalance: 1000 * L, inactiveBalance: 0 }, goals: [g('saving', 10000)] }), 9000)
})

test('redeemed and withdrawn goals do not count in inGoals', () => {
  assert.equal(stakeGap({ st: st(10000), goals: [g('saving', 10000), g('redeemed', 5000), g('withdrawn', 5000)] }), null)
})

test('stakeGapExact: the same gap, not rounded (13,622.4 staked, 22,701 in goals -> 9,078.6)', () => {
  const exact = stakeGapExact({ st: st(13622.4), goals: AZIZ_GOALS })
  assert.ok(Math.abs(exact - 9078.6) < 1e-6, `expected ~9078.6, got ${exact}`)
  assert.equal(stakeGap({ st: st(13622.4), goals: AZIZ_GOALS }), 9078) // stakeGap still floors
})

test('stakeGapExact: null in exactly the same cases as stakeGap', () => {
  assert.equal(stakeGapExact({ st: null, goals: AZIZ_GOALS }), null)
  assert.equal(stakeGapExact({ st: st(13622), goals: AZIZ_GOALS, settling: true }), null)
  assert.equal(stakeGapExact({ st: st(13622), goals: AZIZ_GOALS, pendingDeposit: true }), null)
  assert.equal(stakeGapExact({ st: st(100), goals: [g('saving', 100.6)] }), null) // under 1 NIM
})

test('v1.2.11 keepInWallet closes Aziz gap: Valorant gives 9,079, no gap left', () => {
  const repaired = [g('saving', 3200), g('saving', 19501 - 9079)] // 3,200 + 10,422 = 13,622, exactly the active stake
  assert.equal(stakeGap({ st: st(13622), goals: repaired }), null)
  const exact = stakeGapExact({ st: st(13622), goals: repaired })
  assert.ok(exact == null || exact < 1) // under 1 NIM: nothing to show
})
