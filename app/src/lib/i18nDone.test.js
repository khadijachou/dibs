// v1.2.1 code-screen strings (screens/Done.jsx): every new/changed done_ key exists in en, fr and es with the same
// {placeholders}, no em dash and no "!" (Dibs! is the stamp, not a string key). Plus the short payment ref helper.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeT } from './i18n.js'
import { shortHash } from './history.js'

const T = { en: makeT('en'), fr: makeT('fr'), es: makeT('es') }
const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

const KEYS = [
  'done_title', 'done_copy', 'done_story_one', 'done_story_other', 'done_copied', 'done_pin_copied', 'done_ref_copied',
  'done_note', 'done_ref', 'done_ref_copy', 'done_swap', 'done_home', 'done_stat_saved',
  'done_stat_days_sub_one', 'done_stat_days_sub', 'done_stat_deposits_one', 'done_stat_deposits',
]

test('every v1.2.1 done_ key is in en, fr and es with the same placeholders, no em dash, no "!"', () => {
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

test('done_note carries exactly the {link} placeholder, so "History" can be a link in all three', () => {
  for (const l of ['en', 'fr', 'es']) {
    const parts = T[l]('done_note').split('{link}')
    assert.equal(parts.length, 2, `${l} has one {link}`)
    assert.ok(parts[0].length > 0 && parts[1].length > 0, `${l} text on both sides of the link`)
  }
})

test('the short payment ref is first 6, an ellipsis, last 6; short or missing hashes stay readable', () => {
  const hash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  assert.equal(shortHash(hash), '012345…abcdef')
  assert.equal(shortHash('abcdef1234'), 'abcdef1234') // 10 chars: too short to shorten, shown whole
  assert.equal(shortHash(''), '')
  assert.equal(shortHash(null), '')
  assert.equal(shortHash(undefined), '')
})
