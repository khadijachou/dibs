import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boldParts, earnedDelta, pickStatus, plainText, showEarned, statusLine } from './greeting.js'
import { makeT } from './i18n.js'
import { hasReadyState, readyState } from './readyState.js'

const goal = (id, saved, target = 100, status = 'saving') =>
  ({ id, itemName: id, targetNim: target, status, deposits: saved ? [{ nim: saved, tx: 'x' }] : [] })
const t = makeT('en')
const item = (g) => g.id

test('ready wins: unlocked and waiting, or 100 % saved', () => {
  assert.equal(pickStatus([goal('a', 90), goal('b', 100, 100, 'ready')]).kind, 'ready')
  assert.equal(pickStatus([goal('a', 90), goal('b', 100, 100, 'ready')]).goal.id, 'b')
  assert.equal(pickStatus([goal('a', 90), goal('c', 120)]).goal.id, 'c')
  assert.equal(statusLine([goal('a', 90), goal('c', 100)], { t, item }), 'c is ready. Time to get your card.')
})

test('else the goal closest to done, with its percent', () => {
  const s = pickStatus([goal('a', 20), goal('b', 64), goal('done', 100, 100, 'redeemed')])
  assert.deepEqual([s.kind, s.goal.id, s.pct], ['goal', 'b', 64])
  assert.equal(plainText(statusLine([goal('a', 20), goal('b', 64)], { t, item })), 'b is 64% there.')
})

test('no active goal: greet_none', () => {
  assert.equal(pickStatus([]).kind, 'none')
  assert.equal(pickStatus([goal('x', 100, 100, 'redeemed'), goal('y', 0, 100, 'withdrawn')]).kind, 'none')
  assert.equal(statusLine([], { t, item }), 'Call dibs on something new.')
})

test('earned since the last visit: only from +0.01 NIM', () => {
  assert.equal(showEarned(earnedDelta(0.03, 0.02)), true) // float: 0.009999...
  assert.equal(showEarned(earnedDelta(1.009, 1)), false)
  assert.equal(showEarned(earnedDelta(1, 2)), false)
  assert.equal(showEarned(earnedDelta(5, null)), false)
  assert.equal(showEarned(earnedDelta(null, 1)), false)
  const goals = [goal('b', 64)]
  assert.equal(plainText(statusLine(goals, { t, item, delta: 0.04 })), 'b is 64% there. Staking added +0.04 NIM since your last visit.')
  assert.equal(plainText(statusLine(goals, { t, item, delta: 0.005 })), 'b is 64% there.')
  // Never on the ready or none lines.
  assert.equal(statusLine([goal('c', 100)], { t, item, delta: 3 }), 'c is ready. Time to get your card.')
})

test('numbers come out bold', () => {
  const parts = boldParts(statusLine([goal('b', 64)], { t, item, delta: 12 }))
  assert.deepEqual(parts.filter((p) => p.bold).map((p) => p.text), ['64', '12'])
  assert.equal(makeT('fr')('greet_goal', { item: 'b', pct: 64 }), 'b est à 64 %.')
})

// v1.0.3: Welcome back follows the ready state (lib/readyState.js) for ready goals and goals unlocking for their card.
// 1 NIM = 0.0002 USD: a 20 USD live card costs 100,000 NIM.
const prices = { nimUsd: 0.0002 }
const card = { id: 'steam-20', usd: 20, live: true }
const readyOf = (free) => (g) => (hasReadyState(g) ? readyState(g, card, prices, free) : null)
const line = (g, free) => plainText(statusLine([goal('s', 30, 100_000), g], { t, item, ready: readyOf(free), delta: 3 }))

test('covered: an unlocking goal is "100% there", a ready goal invites to get the card (v1.0.4)', () => {
  assert.equal(line(goal('u', 100_000, 100_000, 'unlocking'), 0), 'u is 100% there. Staking added +3.00 NIM since your last visit.')
  assert.equal(line(goal('r', 100_000, 100_000, 'ready'), 0), 'r is ready. Time to get your card.')
})

test('wallet: the goal screen short line, no percentage', () => {
  // The new card costs more than the saved NIM (Change card while unlocking): 80,000 saved, 20,000 more, 50,000 free.
  for (const status of ['unlocking', 'ready']) {
    assert.equal(line(goal('g', 80_000, 101_000, status), 50_000), 'About 20,000 NIM more from your wallet. You’re covered.', status)
  }
})

test('short: the goal screen short line, no percentage', () => {
  for (const status of ['unlocking', 'ready']) {
    assert.equal(line(goal('g', 80_000, 101_000, status), 5_000), 'Add about 15,000 NIM to your wallet first.', status)
  }
})

test('free NIM unknown (ready returns null): the lines as before', () => {
  assert.equal(statusLine([goal('r', 100_000, 100_000, 'ready')], { t, item }), 'r is ready. Time to get your card.')
})
