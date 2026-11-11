import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freeNimOf, readyState } from './readyState.js'

const goal = (saved, targetNim = 100_000, status = 'ready') => ({ id: 'g', status, targetNim, deposits: [{ nim: saved, at: '2026-11-01T00:00:00Z' }] })
// 1 NIM = 0.0002 USD: a 20 USD live item costs 100,000 NIM.
const prices = { nimUsd: 0.0002, live: true }
const live = { id: 'steam-20', usd: 20, live: true }

test('covered: the saved NIM pays the card at today\'s price (gap 0)', () => {
  const rs = readyState(goal(100_000), live, prices, 0)
  assert.equal(rs.kind, 'covered')
  assert.equal(rs.price, 100_000)
  assert.equal(rs.gap, 0)
  assert.equal(rs.toAdd, 0)
  assert.equal(readyState(goal(120_000), live, prices, 0).kind, 'covered', 'more than the price is covered too')
})

test('wallet: 0 < gap <= free NIM', () => {
  const rs = readyState(goal(95_000), live, prices, 5_000)
  assert.equal(rs.kind, 'wallet')
  assert.equal(rs.gap, 5_000)
  assert.equal(rs.toAdd, 0)
  assert.equal(readyState(goal(95_000), live, prices, 9_999).kind, 'wallet')
})

test('short: gap > free NIM, toAdd = gap - free', () => {
  const rs = readyState(goal(90_000), live, prices, 4_000)
  assert.equal(rs.kind, 'short')
  assert.equal(rs.gap, 10_000)
  assert.equal(rs.free, 4_000)
  assert.equal(rs.toAdd, 6_000)
  assert.equal(readyState(goal(90_000), live, prices, null).toAdd, 10_000, 'unknown free NIM counts as 0')
})

test('estimated follows item.live, and the estimate carries Plan\'s 10 % margin', () => {
  assert.equal(readyState(goal(100_000), live, prices, 0).estimated, false)
  const est = readyState(goal(100_000), { ...live, live: false }, prices, 0)
  assert.equal(est.estimated, true)
  assert.equal(est.price, 110_000)
  assert.equal(est.gap, 10_000)
})

test('no prices or no item: falls back to goal.targetNim', () => {
  assert.equal(readyState(goal(80_000, 90_000), live, null, 0).price, 90_000)
  assert.equal(readyState(goal(80_000, 90_000), null, prices, 0).price, 90_000)
  const rs = readyState(goal(80_000, 90_000), null, null, 20_000)
  assert.equal(rs.kind, 'wallet')
  assert.equal(rs.gap, 10_000)
  assert.equal(rs.estimated, false)
})

test('freeNimOf: wallet minus every ready goal\'s saved NIM, never below 0, null when unread', () => {
  const goals = [goal(50_000), goal(30_000), goal(70_000, 100_000, 'saving')]
  assert.equal(freeNimOf(100_000.7, goals), 20_000)
  assert.equal(freeNimOf(60_000, goals), 0)
  assert.equal(freeNimOf(null, goals), null)
})
