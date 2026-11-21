// v1.6.2 strings for the Savings cards (idle NIM + converter) and the big-update sheet rows: every key is in en, fr and
// es with the same {placeholders}, no em dash and no "!".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeT } from './i18n.js'

const T = { en: makeT('en'), fr: makeT('fr'), es: makeT('es') }
const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

const KEYS = [
  'stake_idle_title', 'stake_idle_est', 'stake_idle_est_none', 'stake_idle_note', 'stake_idle_link',
  'conv_title', 'conv_auto', 'conv_auto_label', 'conv_7d', 'conv_asof',
  'bigup_16_1', 'bigup_16_1b', 'bigup_16_2', 'bigup_16_2b', 'bigup_16_3', 'bigup_16_3b', 'news_sum_52',
]

test('every v1.6.2 string is in en, fr and es with the same placeholders, no em dash, no "!"', () => {
  for (const k of KEYS) {
    const en = T.en(k)
    assert.ok(en && en !== k, `en missing ${k}`)
    const p = ph(en)
    for (const l of ['fr', 'es']) {
      const v = T[l](k)
      assert.ok(v && v !== k, `${l} missing ${k}`)
      assert.deepEqual(ph(v), p, `${k} ${l} placeholders`)
      assert.ok(!v.includes('—'), `${k} ${l} em dash`)
      assert.ok(!v.includes('!'), `${k} ${l} "!"`)
    }
    assert.ok(!en.includes('—') && !en.includes('!'), `${k} en`)
  }
})

test('the idle estimate carries {n}, the converter label {cur}, the trend {x}, the "as of" {time}', () => {
  for (const l of ['en', 'fr', 'es']) {
    assert.deepEqual(ph(T[l]('stake_idle_est')), ['n'], `${l} stake_idle_est`)
    assert.deepEqual(ph(T[l]('conv_auto_label')), ['cur'], `${l} conv_auto_label`)
    assert.deepEqual(ph(T[l]('conv_7d')), ['x'], `${l} conv_7d`)
    assert.deepEqual(ph(T[l]('conv_asof')), ['time'], `${l} conv_asof`)
  }
})
