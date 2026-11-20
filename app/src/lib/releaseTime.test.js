// "Ready at {time}" formats (components/releaseTime.js): local time, en 12-hour with AM/PM, fr "h", es 24-hour.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockTime } from '../components/releaseTime.js'
import { makeT } from './i18n.js'

const at = (h, m) => new Date(2026, 10, 13, h, m).getTime() // local time, like the phone
const NB = '\u00A0' // the no-break space clockTime uses, so a time never splits across two lines

test('midnight', () => {
  assert.equal(clockTime(at(0, 0), 'en'), `12:00${NB}AM`)
  assert.equal(clockTime(at(0, 0), 'fr'), `00${NB}h${NB}00`)
  assert.equal(clockTime(at(0, 0), 'es'), '00:00')
})

test('noon', () => {
  assert.equal(clockTime(at(12, 0), 'en'), `12:00${NB}PM`)
  assert.equal(clockTime(at(12, 0), 'fr'), `12${NB}h${NB}00`)
  assert.equal(clockTime(at(12, 0), 'es'), '12:00')
})

test('13:05, and a leading zero in the morning', () => {
  assert.equal(clockTime(at(13, 5), 'en'), `01:05${NB}PM`)
  assert.equal(clockTime(at(13, 5), 'fr'), `13${NB}h${NB}05`)
  assert.equal(clockTime(at(13, 5), 'es'), '13:05')
  assert.equal(clockTime(at(1, 11), 'en'), `01:11${NB}AM`)
  assert.equal(clockTime(at(1, 11), 'fr'), `01${NB}h${NB}11`)
  assert.equal(clockTime(at(1, 11), 'es'), '01:11')
})

test('the AM/PM and the French "h" are joined by a no-break space, never a plain space', () => {
  assert.ok(clockTime(at(1, 11), 'en').includes(NB) && !/ (AM|PM)$/.test(clockTime(at(1, 11), 'en')))
  assert.ok(clockTime(at(1, 11), 'fr').includes(NB) && !clockTime(at(1, 11), 'fr').includes(' h '))
})

test('"Ready at {time}" in the three languages', () => {
  const time = { en: `01:11${NB}AM`, fr: `01${NB}h${NB}11`, es: '01:11' }
  const want = { en: `Ready at 01:11${NB}AM`, fr: `Prêt à 01${NB}h${NB}11`, es: 'Listo a las 01:11' }
  for (const l of ['en', 'fr', 'es']) assert.equal(makeT(l)('unl_timer_ready', { time: time[l] }), want[l], l)
  for (const l of ['en', 'fr', 'es']) assert.ok(!/around|vers|alrededor/.test(makeT(l)('dup_unlocking') + makeT(l)('err_UNL_NOT_RELEASED_toast')), l)
})
