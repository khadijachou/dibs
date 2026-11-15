// The Home promo banner (components/PromoBanner.jsx): every slide in its LINES array must have a picture in
// src/assets/promo, a promo_<key> line in en, fr and es, and a matching brand in lib/brands.js; and every picture
// must be wired into LINES. Plain node (no JSX import): LINES is read from the file as text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { BRANDS } from './brands.js'

const banner = readFileSync(new URL('../components/PromoBanner.jsx', import.meta.url), 'utf8')
const m = banner.match(/const LINES = \[([^\]]*)\]/)
assert.ok(m, 'LINES array found in PromoBanner.jsx')
const LINES = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])

const i18n = readFileSync(new URL('./i18n.js', import.meta.url), 'utf8')
const promoDir = new URL('../assets/promo/', import.meta.url)
const pics = readdirSync(promoDir).filter((f) => /\.(jpe?g|webp)$/i.test(f))
const picKeys = new Set(pics.map((f) => f.replace(/\.(jpe?g|webp)$/i, '')))
const brandKeys = new Set(BRANDS.map((b) => b.key))

test('LINES has 26 keys, no duplicates and no bolt', () => {
  assert.equal(LINES.length, 26, 'LINES has 26 keys')
  assert.equal(new Set(LINES).size, 26, 'no duplicate key in LINES')
  assert.ok(!LINES.includes('bolt'), 'no bolt slide')
})

test('every LINES key has a picture, a promo line in en/fr/es, and a brand', () => {
  for (const key of LINES) {
    assert.ok(picKeys.has(key), `${key}: picture ${key}.jpg exists in src/assets/promo`)
    const count = [...i18n.matchAll(new RegExp(`^ {2}promo_${key}:`, 'gm'))].length
    assert.equal(count, 3, `${key}: promo_${key} is in en, fr and es (found ${count})`)
    assert.ok(brandKeys.has(key), `${key}: is a brand key in lib/brands.js`)
  }
})

test('every picture in src/assets/promo is wired into LINES', () => {
  for (const key of picKeys) assert.ok(LINES.includes(key), `${key}.jpg has no key in LINES`)
})
