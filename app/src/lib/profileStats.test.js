import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boughtGoals, profileStats, splitEarned, stakeEarnings } from './profileStats.js'

const dep = (nim, at, kind) => ({ nim, at, tx: 'x', ...(kind ? { kind } : {}) })
const goal = (status, targetNim, deposits) => ({ id: Math.random().toString(36), status, targetNim, deposits })
const LUNA = 100_000
const sum = (o) => Object.values(o).reduce((s, n) => s + n, 0)

test('empty ledger: all zero, no date', () => {
  assert.deepEqual(profileStats([]), { totalSaved: 0, goalsDone: 0, cardsBought: 0, activeGoals: 0, savingSince: null })
})

test('lifetime total: real deposits of every goal, withdrawn included, moves excluded', () => {
  const goals = [
    goal('redeemed', 100, [dep(100, '2026-10-02T10:00:00Z')]),
    goal('saving', 500, [dep(200, '2026-10-05T10:00:00Z'), dep(-50, '2026-10-06T10:00:00Z', 'move')]),
    goal('saving', 300, [dep(50, '2026-10-06T10:00:00Z', 'move'), dep(300, '2026-10-07T10:00:00Z')]),
    goal('withdrawn', 400, [dep(150, '2026-09-30T10:00:00Z'), dep(-150, '2026-10-08T10:00:00Z', 'withdraw')]),
  ]
  const s = profileStats(goals)
  assert.equal(s.totalSaved, 750)
  assert.equal(s.goalsDone, 2) // redeemed + the 300/300 goal; the withdrawn one is not done
  assert.equal(s.cardsBought, 1)
  assert.equal(s.cardsBought, boughtGoals(goals).length)
  assert.equal(s.activeGoals, 2)
  assert.equal(s.savingSince, '2026-09-30T10:00:00.000Z')
})

const ADDR = 'NQ00 TEST'
const stk = (activeNim, inactiveNim = 0, retiredNim = 0) => ({ address: ADDR, activeBalance: activeNim * LUNA, inactiveBalance: inactiveNim * LUNA, retiredBalance: retiredNim * LUNA })
const DAY = 86_400_000
const T0 = Date.parse('2026-11-10T00:00:00Z')

test('stake that was there before Dibs is other staked NIM, never earned (mainnet 10 Nov)', () => {
  const goals = [goal('unlocking', 1000, [dep(1000, '2026-11-01T00:00:00Z')]), goal('saving', 1000, [])]
  const first = stakeEarnings(stk(1362, 1000), goals, null, { now: T0 })
  assert.equal(first.earned, 0)
  assert.equal(first.other, 1362)
  assert.equal(first.base.other, 1362)
  // A week later the whole stake earned 9 NIM: only the goals' share counts.
  const later = stakeEarnings(stk(1371, 1000), goals, first.base, { now: T0 + 7 * DAY })
  assert.equal(later.earned, 3.81033) // 9 x 1000 / 2362, to the luna, rounded down
  assert.ok(Math.abs(later.other + later.earned + later.inGoals - later.total) < 1e-6)
})

test('per-goal earned adds up to the goals earned, whatever the split', () => {
  const goals = [
    goal('saving', 1000, [dep(333, '2026-10-01T00:00:00Z')]),
    goal('saving', 1000, [dep(333, '2026-10-01T00:00:00Z')]),
    goal('unlocking', 1000, [dep(334, '2026-10-01T00:00:00Z')]),
    goal('redeemed', 100, [dep(100, '2026-10-01T00:00:00Z')]), // left the stake: no share
    goal('saving', 100, []), // nothing staked: no share
  ]
  const { base } = stakeEarnings(stk(600, 300, 100), goals, null, { now: T0 })
  for (const rewards of [0, 1, 2, 7, 20]) {
    const r = stakeEarnings(stk(600 + rewards, 300, 100), goals, base, { now: T0 + 60 * DAY })
    assert.equal(r.earned, rewards) // no other stake: all rewards are the goals'
    assert.equal(sum(r.byGoal), r.earned, `rewards ${rewards}`)
    assert.equal(Object.keys(r.byGoal).length, 3)
  }
})

test('unreliable: hidden, never guessed', () => {
  const goals = [goal('saving', 1000, [dep(500, '2026-10-01T00:00:00Z')])]
  assert.equal(stakeEarnings(null, goals).earned, null) // goals but no staker read
  assert.equal(stakeEarnings(stk(400), goals).earned, null) // ledger above the chain
  assert.equal(stakeEarnings(stk(900), goals, null, { settling: true }).earned, null) // no base while settling
  assert.equal(stakeEarnings(null, []).earned, 0)
})

test('NIM added outside Dibs moves to other, keeps the rewards already counted', () => {
  const goals = [goal('saving', 1000, [dep(1000, '2026-10-01T00:00:00Z')])]
  const a = stakeEarnings(stk(1000), goals, null, { now: T0 })
  const b = stakeEarnings(stk(1005), goals, a.base, { now: T0 + 30 * DAY })
  assert.equal(b.earned, 5)
  const c = stakeEarnings(stk(1505), goals, b.base, { now: T0 + 30 * DAY + 1000 }) // +500 staked elsewhere
  assert.equal(c.earned, 5)
  assert.equal(c.other, 500)
  assert.equal(stakeEarnings(stk(1505), goals, b.base, { now: T0 + 30 * DAY + 1000, settling: true }).earned, null)
})

test('split follows each goal\'s stake', () => {
  const a = goal('saving', 1000, [dep(750, '2026-10-01T00:00:00Z')])
  const b = goal('saving', 1000, [dep(250, '2026-10-01T00:00:00Z')])
  assert.deepEqual(splitEarned(40, [a, b]), { [a.id]: 30, [b.id]: 10 })
})
