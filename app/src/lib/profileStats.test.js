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

test('per-goal earned adds up to Stake earned, whatever the split', () => {
  const goals = [
    goal('saving', 1000, [dep(333, '2026-10-01T00:00:00Z')]),
    goal('saving', 1000, [dep(333, '2026-10-01T00:00:00Z')]),
    goal('unlocking', 1000, [dep(334, '2026-10-01T00:00:00Z')]),
    goal('redeemed', 100, [dep(100, '2026-10-01T00:00:00Z')]), // left the stake: no share
    goal('saving', 100, []), // nothing staked: no share
  ]
  for (const rewards of [0, 1, 2, 7, 100, 12345]) {
    const st = { activeBalance: (1000 + rewards - 400) * LUNA, inactiveBalance: 300 * LUNA, retiredBalance: 100 * LUNA }
    const r = stakeEarnings(st, goals)
    assert.equal(r.earned, rewards)
    assert.equal(sum(r.byGoal), r.earned, `rewards ${rewards}`)
    assert.equal(Object.keys(r.byGoal).length, 3)
  }
  assert.deepEqual(stakeEarnings(null, goals), { total: 0, earned: 0, byGoal: splitEarned(0, goals.slice(0, 3)) })
})

test('split follows each goal\'s stake', () => {
  const a = goal('saving', 1000, [dep(750, '2026-10-01T00:00:00Z')])
  const b = goal('saving', 1000, [dep(250, '2026-10-01T00:00:00Z')])
  assert.deepEqual(splitEarned(40, [a, b]), { [a.id]: 30, [b.id]: 10 })
})
