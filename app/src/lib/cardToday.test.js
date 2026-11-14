import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardToday, fmtChange, fmtPctChange, pctOf } from './cardToday.js'
import { readyState } from './readyState.js'

// 50 USD card. At 0.0005 USD/NIM it costs 100,000 NIM.
const item = { id: 'x', usd: 50 }
const goal = (o = {}) => ({ id: 'g', targetNim: 100_000, nimUsdAtCreate: 0.0005, deposits: [{ nim: 60_000 }], status: 'saving', ...o })
const live = (nimUsd) => ({ nimUsd, live: true })

test('price up since dibs (NIM went down): positive change and percent', () => {
  const c = cardToday(goal(), item, live(0.0004), { free: 0 })
  assert.equal(c.live, true)
  assert.equal(c.price, 125_000)
  assert.equal(c.since, 25_000)
  assert.equal(c.sincePct, 25)
})

test('price down since dibs: negative change and percent', () => {
  const c = cardToday(goal(), item, live(0.000625), { free: 0 })
  assert.equal(c.price, 80_000)
  assert.equal(c.since, -20_000)
  assert.equal(c.sincePct, -20)
})

test('covered, wallet, short at 100 %', () => {
  const full = goal({ deposits: [{ nim: 100_000 }] })
  assert.equal(cardToday(full, item, live(0.0005), { free: 0 }).kind, 'covered')
  const w = cardToday(full, item, live(0.0004), { free: 30_000 })
  assert.equal(w.kind, 'wallet'); assert.equal(w.gap, 25_000); assert.equal(w.toAdd, 0); assert.equal(w.free, 30_000)
  const s = cardToday(full, item, live(0.0004), { free: 10_000 })
  assert.equal(s.kind, 'short'); assert.equal(s.toAdd, 15_000)
})

test('wallet unknown: covered stays covered, otherwise unknown with no free and no toAdd', () => {
  const full = goal({ deposits: [{ nim: 100_000 }] })
  assert.equal(cardToday(full, item, live(0.0005), { free: null }).kind, 'covered')
  const u = cardToday(full, item, live(0.0004), { free: null })
  assert.equal(u.kind, 'unknown'); assert.equal(u.free, null); assert.equal(u.toAdd, null); assert.equal(u.gap, 25_000)
})

test('no live rate, missing prices, missing item: not live, plan price', () => {
  assert.deepEqual(cardToday(goal(), item, { nimUsd: 0.0005, live: false }), { live: false, planNim: 100_000 })
  assert.deepEqual(cardToday(goal(), item, null), { live: false, planNim: 100_000 })
  assert.deepEqual(cardToday(goal(), item, { nimUsd: 0 }), { live: false, planNim: 100_000 })
  assert.deepEqual(cardToday(goal(), null, live(0.0005)), { live: false, planNim: 100_000 })
  assert.deepEqual(cardToday(goal(), { id: 'x', usd: null }, live(0.0005)), { live: false, planNim: 100_000 })
})

test('no stored rate at creation, or a card change: no "since"', () => {
  assert.equal(cardToday(goal({ nimUsdAtCreate: null }), item, live(0.0004)).since, null)
  assert.equal(cardToday(goal({ nimUsdAtCreate: 0 }), item, live(0.0004)).since, null)
  assert.equal(cardToday(goal({ cardChanges: [{ itemId: 'old' }] }), item, live(0.0004)).since, null)
  assert.equal(cardToday(goal({ cardChanges: [] }), item, live(0.0004)).since, 25_000)
})

test('7 days: change against the same card at the older rate; none without a rate', () => {
  const c = cardToday(goal(), item, live(0.0004), { rate7d: 0.0005 })
  assert.equal(c.d7, 25_000); assert.equal(c.d7Pct, 25)
  const d = cardToday(goal(), item, live(0.0005), { rate7d: 0.0004 })
  assert.equal(d.d7, -25_000); assert.equal(d.d7Pct, -20)
  for (const r of [null, undefined, 0, -1, '0.1']) assert.equal(cardToday(goal(), item, live(0.0004), { rate7d: r }).d7, null)
})

test('percent rounding: 0.4 -> 0, 0.5 -> 1, symmetric for negatives, no -0', () => {
  assert.equal(pctOf(4, 1000), 0)
  assert.equal(pctOf(5, 1000), 1)
  assert.equal(pctOf(-5, 1000), -1)
  assert.equal(pctOf(-4, 1000), 0)
  assert.ok(!Object.is(pctOf(-4, 1000), -0))
  assert.equal(pctOf(-183, 1000), -18)
})

test('signs: "+", U+2212 minus, 0 without sign; fr percent with a no-break space', () => {
  assert.equal(fmtChange(1234, 'en'), '+1,234')
  assert.equal(fmtChange(-56, 'en'), '−56')
  assert.equal(fmtChange(0, 'en'), '0')
  assert.equal(fmtPctChange(18, 'en'), '+18%')
  assert.equal(fmtPctChange(-18, 'es'), '−18%')
  assert.equal(fmtPctChange(18, 'fr'), '+18 %')
  assert.equal(fmtPctChange(0, 'en'), '0%')
})

test('price, gap, kind equal readyState for the same inputs', () => {
  for (const [nimUsd, free, dep] of [[0.0004, 30_000, 100_000], [0.0004, 0, 100_000], [0.0006, 0, 60_000], [0.0005, 5, 99_999]]) {
    const g = goal({ deposits: [{ nim: dep }] })
    const c = cardToday(g, item, live(nimUsd), { free })
    const rs = readyState(g, item, live(nimUsd), free)
    assert.equal(c.price, rs.price); assert.equal(c.gap, rs.gap); assert.equal(c.kind, rs.kind); assert.equal(c.saved, rs.saved)
  }
})

test('never throws on a broken goal, and never writes targetNim', () => {
  for (const g of [null, undefined, {}, { targetNim: 'x' }, { targetNim: 10, deposits: null }]) {
    assert.doesNotThrow(() => cardToday(g, item, live(0.0005), { free: 0 }))
  }
  const g = Object.freeze(goal())
  cardToday(g, item, live(0.0004), { free: 0, rate7d: 0.0005 })
  assert.equal(g.targetNim, 100_000)
})
