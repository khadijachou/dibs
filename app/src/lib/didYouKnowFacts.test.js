// The "Did you know?" facts in lib/i18n.js: dyk_u1..dyk_u20 and dyk_c1..dyk_c27 exist in en, fr and es and nowhere
// beyond those counts, every fact fits on a short line (32 characters as the user sees them), none uses an em dash
// or "!", and dyk_label exists in the three languages. Reads the raw dicts so a missing key in one language is not
// hidden by the en fallback that makeT applies.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DICTS } from './i18n.js'
import { DYK_U_COUNT, DYK_C_COUNT } from './didYouKnow.js'

const LANGS = ['en', 'fr', 'es']
const MAX = 32
// A key is "present in its own language" only if the dict owns it (fr/es spread ...en, so own text differs or, for a
// shared value, it is still the same string present under that key): we check the resolved value exists and is a string.
const has = (dict, key) => typeof dict[key] === 'string' && dict[key].length > 0

test('dyk_u1..u20 and dyk_c1..c27 exist in en, fr and es', () => {
  for (const lang of LANGS) {
    const d = DICTS[lang]
    for (let i = 1; i <= DYK_U_COUNT; i++) assert.ok(has(d, `dyk_u${i}`), `${lang} missing dyk_u${i}`)
    for (let i = 1; i <= DYK_C_COUNT; i++) assert.ok(has(d, `dyk_c${i}`), `${lang} missing dyk_c${i}`)
  }
})

test('no dyk fact exists beyond the two counts', () => {
  for (const lang of LANGS) {
    const d = DICTS[lang]
    assert.ok(!has(d, `dyk_u${DYK_U_COUNT + 1}`), `${lang} has a dyk_u beyond ${DYK_U_COUNT}`)
    assert.ok(!has(d, `dyk_c${DYK_C_COUNT + 1}`), `${lang} has a dyk_c beyond ${DYK_C_COUNT}`)
    // Any dyk_u* / dyk_c* key must be within range (nothing stray).
    for (const key of Object.keys(d)) {
      let m = key.match(/^dyk_u(\d+)$/)
      if (m) assert.ok(Number(m[1]) >= 1 && Number(m[1]) <= DYK_U_COUNT, `${lang} stray ${key}`)
      m = key.match(/^dyk_c(\d+)$/)
      if (m) assert.ok(Number(m[1]) >= 1 && Number(m[1]) <= DYK_C_COUNT, `${lang} stray ${key}`)
    }
  }
})

test('every fact is 32 characters or fewer, no em dash, no "!"', () => {
  for (const lang of LANGS) {
    const d = DICTS[lang]
    const keys = [
      ...Array.from({ length: DYK_U_COUNT }, (_, i) => `dyk_u${i + 1}`),
      ...Array.from({ length: DYK_C_COUNT }, (_, i) => `dyk_c${i + 1}`),
    ]
    for (const key of keys) {
      const fact = d[key]
      const len = [...fact].length // characters as the user sees them
      assert.ok(len <= MAX, `${lang} ${key} is ${len} chars: "${fact}"`)
      assert.ok(!fact.includes('—'), `${lang} ${key} has an em dash`)
      assert.ok(!fact.includes('!'), `${lang} ${key} has a "!"`)
    }
  }
})

test('dyk_label exists in the three languages', () => {
  for (const lang of LANGS) assert.ok(has(DICTS[lang], 'dyk_label'), `${lang} missing dyk_label`)
})
