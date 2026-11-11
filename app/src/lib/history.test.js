import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTimeline } from './history.js'

const name = (c) => `${c.itemName} · ${c.itemDetail}`
const dep = (at, nim = 100) => ({ id: at, nim, tx: `tx${at}`, at })

test('one card change: rows before it keep the old card, rows after it the new card, plus one change row', () => {
  const g = {
    id: 'g1', itemName: 'Valorant', itemDetail: '25 EUR', region: 'Europe', status: 'saving',
    deposits: [dep('2026-11-01T10:00:00Z'), dep('2026-11-03T10:00:00Z')],
    cardChanges: [{ at: '2026-11-02T10:00:00Z', itemId: 'v-usa', itemName: 'Valorant', itemDetail: '25 USD', region: 'USA' }],
  }
  const ev = buildTimeline([g], name)
  const deps = ev.filter((e) => e.type === 'deposit')
  assert.equal(deps.find((e) => e.at.startsWith('2026-11-01')).goal, 'Valorant · 25 USD')
  assert.equal(deps.find((e) => e.at.startsWith('2026-11-03')).goal, 'Valorant · 25 EUR')
  const changes = ev.filter((e) => e.type === 'change')
  assert.equal(changes.length, 1)
  assert.equal(changes[0].from, 'Valorant · 25 USD')
  assert.equal(changes[0].to, 'Valorant · 25 EUR')
  assert.equal(changes[0].tx, undefined)
  assert.equal(changes[0].nim, undefined)
  assert.deepEqual(ev.map((e) => e.type), ['deposit', 'change', 'deposit'], 'newest first, the change at its time')
})

test('two card changes: each segment gets its own card, and each change row names old and new', () => {
  const g = {
    id: 'g2', itemName: 'C', itemDetail: '30 USD', status: 'ready',
    deposits: [dep('2026-11-01T00:00:00Z'), dep('2026-11-03T00:00:00Z'), dep('2026-11-05T00:00:00Z')],
    unlockSteps: [{ step: 'deactivate', tx: 'u1', at: '2026-11-04T00:00:00Z' }],
    cardChanges: [
      { at: '2026-11-04T12:00:00Z', itemName: 'B', itemDetail: '20 USD' }, // stored out of order on purpose
      { at: '2026-11-02T00:00:00Z', itemName: 'A', itemDetail: '10 USD' },
    ],
  }
  const ev = buildTimeline([g], name)
  const at = (type, day) => ev.find((e) => e.type === type && e.at.startsWith(`2026-11-0${day}`))
  assert.equal(at('deposit', 1).goal, 'A · 10 USD')
  assert.equal(at('deposit', 3).goal, 'B · 20 USD')
  assert.equal(at('unlock', 4).goal, 'B · 20 USD')
  assert.equal(at('deposit', 5).goal, 'C · 30 USD')
  const changes = ev.filter((e) => e.type === 'change').reverse()
  assert.deepEqual(changes.map((e) => [e.from, e.to]), [['A · 10 USD', 'B · 20 USD'], ['B · 20 USD', 'C · 30 USD']])
})

test('no card change: every row uses the current card, no change row', () => {
  const g = { id: 'g3', itemName: 'Steam', itemDetail: '20 USD', status: 'saving', deposits: [dep('2026-11-01T00:00:00Z')] }
  const ev = buildTimeline([g], name)
  assert.deepEqual(ev.map((e) => [e.type, e.goal]), [['deposit', 'Steam · 20 USD']])
})
