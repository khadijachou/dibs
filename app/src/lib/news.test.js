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

// The timeline (components/LegalText.jsx NEWS): every block's news_N is one of the keys checked above, newest first,
// and the newest version is the app's version. Read as text: LegalText.jsx is JSX and does not load under node --test.
const legal = readFileSync(new URL('../components/LegalText.jsx', import.meta.url), 'utf8')
const timeline = [...legal.matchAll(/\{ date: '([\d-]+)', key: '(news_\d+)'(?:, v: '([\d.]+)')? \}/g)].map((m) => ({ date: m[1], key: m[2], v: m[3] || null }))
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const vNum = (v) => v.split('.').map(Number).reduce((a, n, i) => a + n * 1000 ** (2 - i), 0)

test('every What’s new block uses a checked news_N, versions newest first', () => {
  assert.ok(timeline.length >= 10)
  for (const b of timeline) assert.ok(keys.includes(b.key), `${b.key} is in the timeline but not in i18n.js`)
  const versions = timeline.filter((b) => b.v).map((b) => b.v)
  for (let i = 1; i < versions.length; i++) assert.ok(vNum(versions[i - 1]) > vNum(versions[i]), `${versions[i - 1]} before ${versions[i]}`)
  assert.equal(versions[0], pkg.version.replace(/\.0$/, ''), 'the newest block is the app version')
})

test('v1.0.5 (news_10) sits between 1.0.6 and 1.0.4, with the same items in en, fr and es', () => {
  const vs = timeline.map((b) => b.v)
  const i = vs.indexOf('1.0.5')
  assert.equal(timeline[i].key, 'news_10')
  assert.equal(vs[i - 1], '1.0.6')
  assert.equal(vs[i + 1], '1.0.4')
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_10')).length, 2, `news_10 ${l}`)
})

test('a two-digit patch is newer: 1.0.10 after 1.0.9', () => {
  assert.ok(vNum('1.0.10') > vNum('1.0.9'))
  const vs = timeline.map((b) => b.v)
  assert.equal(vs[vs.indexOf('1.0.10') + 1], '1.0.9')
})

test('1.1.0 (shown as 1.1, like 1.0.0 as 1.0) heads the timeline, after 1.0.10', () => {
  assert.ok(vNum('1.1') > vNum('1.0.10'))
  assert.equal(timeline[0].v, '1.1')
  assert.equal(timeline[0].key, 'news_13')
  assert.equal(timeline[1].v, '1.0.10')
})

test('1.1.0 (news_13) has one item in en, fr and es, naming the five new brands', () => {
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_13'))
    assert.equal(list.length, 1, `news_13 ${l}`)
    for (const b of ['Bolt', 'Twitch', 'H&M', 'Nike', 'Burger King']) assert.ok(list[0].includes(b), `news_13 ${l} names ${b}`)
  }
})

test('1.0.10 (news_12) has three items in en, fr and es', () => {
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_12')).length, 3, `news_12 ${l}`)
})
