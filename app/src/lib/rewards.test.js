import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REWARDS, active, claimDetails, groupAddress, state } from './rewards.js'
import { makeT } from './i18n.js'

const DAY = 864e5
const NOW = Date.parse('2026-11-10T12:00:00Z')
const iso = (ms) => new Date(ms).toISOString()
const goal = (over = {}) => ({ id: 'g1', status: 'saving', deposits: [], createdAt: iso(NOW - DAY), payment: null, ...over })
const t = makeT('en')

test('the program runs until 30 Nov 2026, 23:59:59 UTC', () => {
  assert.ok(active(NOW))
  assert.ok(active(Date.parse('2026-11-30T23:59:58Z')))
  assert.ok(!active(Date.parse('2026-11-30T23:59:59Z')))
  assert.ok(!active(Date.parse('2026-12-01T00:00:00Z')))
})

test('state: not earned, waiting 7 days after the first real deposit, then claim', () => {
  const goals = [goal({ deposits: [{ nim: 50, kind: 'move', at: iso(NOW - 20 * DAY) }, { nim: 100, tx: 'aa', at: iso(NOW - 2 * DAY) }, { nim: 100, tx: 'bb', at: iso(NOW - DAY) }] })]
  assert.deepEqual(state('planted', { badges: {}, goals, now: NOW }), { state: 'not' })
  const badges = { planted: { at: iso(NOW) } }
  assert.deepEqual(state('planted', { badges, goals, now: NOW }), { state: 'wait', date: iso(NOW + 5 * DAY) })
  assert.deepEqual(state('planted', { badges, goals, now: NOW + 5 * DAY }), { state: 'claim' })
  assert.deepEqual(state('dibs', { badges: {}, goals, now: NOW }), { state: 'not' })
  assert.deepEqual(state('dibs', { badges: { dibs: { at: iso(NOW) } }, goals, now: NOW }), { state: 'claim' })
  assert.deepEqual(state('first', { badges: { first: { at: iso(NOW) } }, goals, now: NOW }), { state: 'not' })
})

test('claim details: planted gives the first real deposit tx and the address in groups of 4', () => {
  const goals = [goal({ deposits: [{ nim: 30, kind: 'move', tx: 'mv', at: iso(NOW - 9 * DAY) }, { nim: 100, tx: 'abc123', at: iso(NOW - 8 * DAY) }] })]
  assert.deepEqual(claimDetails('planted', { goals, walletAddress: 'nq15hnahyrvhdfvmyhagbsxg0qhkka0qxdr7', t }), [
    'Dibs reward: Planted',
    'Deposit tx: abc123',
    'Address: NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7',
  ])
  assert.equal(claimDetails('planted', { goals: [], walletAddress: '', t })[1], 'Deposit tx: -')
})

test('claim details: dibs gives the first redeemed goal order id', () => {
  const goals = [
    goal({ id: 'b', status: 'redeemed', payment: { orderId: 'second', at: iso(NOW) } }),
    goal({ id: 'a', status: 'redeemed', payment: { orderId: 'first', at: iso(NOW - DAY) } }),
  ]
  const lines = claimDetails('dibs', { goals, walletAddress: 'NQ15 HNAH', t })
  assert.deepEqual(lines, ['Dibs reward: Dibs!', 'Order id: first', 'Address: NQ15 HNAH'])
  assert.equal(claimDetails('dibs', { goals: [], walletAddress: 'x', t })[1], 'Order id: -')
  assert.equal(claimDetails('dibs', { goals, walletAddress: 'x', t: makeT('fr') })[0], 'Récompense Dibs: Dibs!')
})

test('groupAddress', () => {
  assert.equal(groupAddress('NQ15 HNAH YRVH'), 'NQ15 HNAH YRVH')
  assert.equal(groupAddress(''), '')
})

test('places and amounts: Dibs! first 20 at 5,000 NIM, Planted first 30 at 1,000 NIM (budget 130,000 NIM)', () => {
  assert.equal(REWARDS.dibs.places, 20)
  assert.equal(REWARDS.planted.places, 30)
  assert.equal(REWARDS.dibs.nim, 5000)
  assert.equal(REWARDS.planted.nim, 1000)
  assert.equal(REWARDS.dibs.places * REWARDS.dibs.nim + REWARDS.planted.places * REWARDS.planted.nim, 130000)
})
