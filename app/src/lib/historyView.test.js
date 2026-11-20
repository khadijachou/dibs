// History screen helpers (screens/historyView.js): the day total and the row time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayDeposits, fmtTime, UNLOCK_TITLE } from '../screens/historyView.js'
import { makeT } from './i18n.js'

test('the day total sums deposits only', () => {
  const day = [
    { type: 'deposit', nim: 120 }, { type: 'deposit', nim: 30.5 }, { type: 'move', nim: 500 },
    { type: 'unlock', nim: 900 }, { type: 'purchase', nim: 900 }, { type: 'withdraw', nim: 40 }, { type: 'change' },
  ]
  assert.equal(dayDeposits(day), 150.5)
  assert.equal(dayDeposits([{ type: 'move', nim: 5 }]), 0)
})

test('the row time: en 11:12 PM, fr 23 h 12, es 23:12, joined by no-break spaces', () => {
  const NB = '\u00A0' // no-break space, so a time never splits across two lines
  const at = new Date(2026, 10, 13, 23, 12).toISOString()
  assert.equal(fmtTime(at, 'en'), `11:12${NB}PM`)
  assert.equal(fmtTime(at, 'fr'), `23${NB}h${NB}12`)
  assert.equal(fmtTime(at, 'es'), '23:12')
  assert.equal(fmtTime(new Date(2026, 10, 13, 9, 5).toISOString(), 'fr'), `9${NB}h${NB}05`)
  // no plain space in a time: nothing can break "PM" or "h 12" onto the next line
  assert.ok(!/ /.test(fmtTime(at, 'en')), 'en has no plain space')
  assert.ok(!/ /.test(fmtTime(at, 'fr')), 'fr has no plain space')
})

test('every unlock step has a short title in en, fr and es', () => {
  for (const l of ['en', 'fr', 'es']) {
    const t = makeT(l)
    for (const k of Object.values(UNLOCK_TITLE)) assert.ok(t(k) && t(k) !== k, `${l} ${k}`)
  }
})
