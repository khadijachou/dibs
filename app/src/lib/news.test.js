// What's new (components/LegalText.jsx): each news_N holds one item per line ("\n"), and the page shows one bullet
// per item. The three languages must give the same number of items for every release.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeT } from './i18n.js'

const src = readFileSync(new URL('./i18n.js', import.meta.url), 'utf8')
const keys = [...new Set([...src.matchAll(/^ {2}(news_\d+):/gm)].map((m) => m[1]))]
const items = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean)
const T = { en: makeT('en'), fr: makeT('fr'), es: makeT('es') }

test('every news_N exists in en, fr and es', () => {
  assert.ok(keys.length >= 7)
  for (const k of keys) {
    const count = [...src.matchAll(new RegExp(`^ {2}${k}:`, 'gm'))].length
    assert.equal(count, 3, `${k} is in ${count} languages`)
  }
})

test('every news_N has the same number of items in en, fr and es', () => {
  for (const k of keys) {
    const n = items(T.en(k)).length
    assert.ok(n >= 1, k)
    assert.equal(items(T.fr(k)).length, n, `${k} fr`)
    assert.equal(items(T.es(k)).length, n, `${k} es`)
  }
})

test('no item is empty, cut inside an abbreviation, or uses an em dash', () => {
  for (const k of keys) for (const l of ['en', 'fr', 'es']) {
    for (const it of items(T[l](k))) {
      assert.ok(it.length > 3, `${k} ${l}: "${it}"`)
      assert.ok(!/\b(EE|UU)\.$/.test(it), `${k} ${l}: cut after an abbreviation "${it}"`)
      assert.ok(!it.includes('—'), `${k} ${l}: em dash`)
    }
  }
})
