// What's new (components/LegalText.jsx): each news_N holds one item per line ("\n"), and the page shows one bullet
// per item. The three languages must give the same number of items for every release.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeT } from './i18n.js'
import { NEWS } from './news.js'

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

// The timeline (lib/news.js NEWS, shown by components/LegalText.jsx): every block's news_N is one of the keys checked
// above, newest first, and the newest version is the app's version. Optional fields (big, sum, n) do not change it.
const timeline = NEWS.map((b) => ({ date: b.date, key: b.key, v: b.v || null }))
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

test('1.1.3 (news_16) comes right after 1.1.4, then 1.1.2 (news_15), 1.1.1 (news_14), 1.1.0 (shown as 1.1, like 1.0.0 as 1.0), 1.0.10', () => {
  assert.ok(vNum('1.1.3') > vNum('1.1.2') && vNum('1.1.2') > vNum('1.1.1') && vNum('1.1.1') > vNum('1.1') && vNum('1.1') > vNum('1.0.10'))
  assert.deepEqual(timeline.slice(10, 15).map((b) => b.v), ['1.1.3', '1.1.2', '1.1.1', '1.1', '1.0.10'])
  assert.deepEqual(timeline.slice(10, 14).map((b) => b.key), ['news_16', 'news_15', 'news_14', 'news_13'])
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_16')).length, 2, `news_16 ${l}`)
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_14')).length, 1, `news_14 ${l}`)
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_15')).length, 2, `news_15 ${l}`)
})

test('1.1.2 is not big: no dot on More for it', () => {
  assert.ok(!NEWS.find((b) => b.v === '1.1.2').big)
})

test('1.1.9 and 1.1.0 are the only big ones, and the 1.1.0 summary says 5 new brands in en, fr and es', () => {
  assert.deepEqual(NEWS.filter((b) => b.big).map((b) => b.v), ['1.1.9', '1.1'])
  const b = NEWS.find((x) => x.v === '1.1')
  // Short enough for one line on the More row at 320 px next to the "New" tag, with no ellipsis.
  const want = { en: '5 new brands', fr: '5 nouvelles marques', es: '5 marcas nuevas' }
  for (const l of ['en', 'fr', 'es']) assert.equal(T[l](b.sum, { n: b.n }), want[l], l)
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

test('v1.1.4 (news_17) comes right after 1.1.5 and before 1.1.3, not big, two items in en, fr and es', () => {
  assert.equal(NEWS[9].v, '1.1.4')
  assert.equal(NEWS[9].key, 'news_17')
  assert.equal(NEWS[10].v, '1.1.3')
  assert.ok(!NEWS[9].big)
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_17')).length, 2, `news_17 ${l}`)
})

test('v1.1.5 (news_18) comes right after 1.1.6, then 1.1.4, dated 2026-11-13, not big, two items naming Profile in each language', () => {
  assert.ok(vNum('1.1.5') > vNum('1.1.4'))
  assert.equal(NEWS[8].v, '1.1.5')
  assert.equal(NEWS[8].key, 'news_18')
  assert.equal(NEWS[8].date, '2026-11-13')
  assert.ok(!NEWS[8].big)
  assert.equal(timeline[9].v, '1.1.4')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_18'))
    assert.equal(list.length, 2, `news_18 ${l}`)
    assert.ok(list[0].includes(T[l]('tab_profile')), `news_18 ${l} uses the tab name`)
  }
})

test('v1.1.6 (news_19) comes right after 1.1.7, then 1.1.5, dated 2026-11-13, not big, two items naming Profile and light mode', () => {
  assert.ok(vNum('1.1.6') > vNum('1.1.5'))
  assert.equal(NEWS[7].v, '1.1.6')
  assert.equal(NEWS[7].key, 'news_19')
  assert.equal(NEWS[7].date, '2026-11-13')
  assert.ok(!NEWS[7].big)
  assert.equal(timeline[7].v, '1.1.6')
  assert.equal(timeline[8].v, '1.1.5')
  const light = { en: 'light mode', fr: 'mode clair', es: 'modo claro' }
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_19'))
    assert.equal(list.length, 2, `news_19 ${l}`)
    assert.ok(list[0].includes(T[l]('tab_profile')), `news_19 ${l} uses the tab name`)
    assert.ok(list[1].toLowerCase().includes(light[l]) && light[l].includes(T[l]('theme_light').toLowerCase()), `news_19 ${l} names light mode`)
  }
})

test('v1.1.7 (news_20) comes right after 1.1.8, then 1.1.6, dated 2026-11-13, not big, one item naming the five brands, not Flightgift', () => {
  assert.ok(vNum('1.1.7') > vNum('1.1.6'))
  assert.equal(NEWS[6].v, '1.1.7')
  assert.equal(NEWS[6].key, 'news_20')
  assert.equal(NEWS[6].date, '2026-11-13')
  assert.ok(!NEWS[6].big)
  assert.equal(timeline[6].v, '1.1.7')
  assert.equal(timeline[7].v, '1.1.6')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_20'))
    assert.equal(list.length, 1, `news_20 ${l}`)
    for (const b of ['Steam', 'Best Buy', 'Apple', 'Uber', 'Fortnite']) assert.ok(list[0].includes(b), `news_20 ${l} names ${b}`)
    assert.ok(!list[0].includes('Flightgift'), `news_20 ${l} does not name Flightgift`)
  }
})

test('v1.1.8 (news_21) comes right after 1.1.9, then 1.1.7, dated 2026-11-13, not big, two items in en, fr and es', () => {
  assert.ok(vNum('1.1.8') > vNum('1.1.7'))
  assert.equal(NEWS[5].v, '1.1.8')
  assert.equal(NEWS[5].key, 'news_21')
  assert.equal(NEWS[5].date, '2026-11-13')
  assert.ok(!NEWS[5].big, 'not big: no news dot')
  assert.equal(timeline[5].v, '1.1.8')
  assert.equal(timeline[6].v, '1.1.7')
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_21')).length, 2, `news_21 ${l}`)
})

test('v1.1.9 (news_22) comes right after 1.1.10, then 1.1.8, dated 2026-11-13, big with a summary, one item in en, fr and es', () => {
  assert.ok(vNum('1.1.9') > vNum('1.1.8'))
  assert.equal(NEWS[4].v, '1.1.9')
  assert.equal(NEWS[4].key, 'news_22')
  assert.equal(NEWS[4].date, '2026-11-13')
  assert.equal(NEWS[4].big, true, 'big: the news dot lights up')
  assert.equal(NEWS[4].sum, 'news_sum_22')
  assert.equal(timeline[4].v, '1.1.9')
  assert.equal(timeline[5].v, '1.1.8')
  const want = { en: 'An important fix for unlocking', fr: 'Un correctif important pour le déblocage', es: 'Una corrección importante para el desbloqueo' }
  const start = { en: 'Fixed: ', fr: 'Corrigé : ', es: 'Corregido: ' }
  for (const l of ['en', 'fr', 'es']) {
    assert.equal(T[l](NEWS[4].sum, { n: NEWS[4].n }), want[l], l)
    const list = items(T[l]('news_22'))
    assert.equal(list.length, 1, `news_22 ${l}`)
    assert.ok(list[0].startsWith(start[l]), `news_22 ${l}`)
    assert.ok(!list[0].includes('!') && !list[0].includes('—'), `news_22 ${l}`)
  }
})

test('a two-digit patch is newer: 1.1.10 after 1.1.9 (numeric order, as 1.0.10 after 1.0.9)', () => {
  assert.ok(vNum('1.1.10') > vNum('1.1.9'))
  assert.ok(vNum('1.1.10') < vNum('1.2'))
  const vs = timeline.map((b) => b.v)
  assert.equal(vs[vs.indexOf('1.1.10') + 1], '1.1.9')
})

test('v1.1.10 (news_23) comes right after 1.1.11, then 1.1.9, dated 2026-11-13, not big, two items naming the Add NIM page in en, fr and es', () => {
  assert.equal(NEWS[3].v, '1.1.10')
  assert.equal(NEWS[3].key, 'news_23')
  assert.equal(NEWS[3].date, '2026-11-13')
  assert.ok(!NEWS[3].big, 'not big: no news dot')
  assert.ok(!NEWS[3].sum)
  assert.equal(timeline[3].v, '1.1.10')
  assert.equal(timeline[4].v, '1.1.9')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_23'))
    assert.equal(list.length, 2, `news_23 ${l}`)
    assert.ok(list[1].includes(T[l]('goal_add_nim')), `news_23 ${l} uses the page's name`)
    for (const it of list) assert.ok(!it.includes('!') && !it.includes('—'), `news_23 ${l}`)
  }
})

test('v1.1.11 (news_24) comes right after 1.1.12, then 1.1.10, dated 2026-11-13, not big, one item naming Dibs in numbers in en, fr and es', () => {
  assert.ok(vNum('1.1.11') > vNum('1.1.10'))
  assert.equal(NEWS[2].v, '1.1.11')
  assert.equal(NEWS[2].key, 'news_24')
  assert.equal(NEWS[2].date, '2026-11-13')
  assert.ok(!NEWS[2].big, 'not big: no news dot')
  assert.ok(!NEWS[2].sum)
  assert.equal(timeline[2].v, '1.1.11')
  assert.equal(timeline[3].v, '1.1.10')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_24'))
    assert.equal(list.length, 1, `news_24 ${l}`)
    assert.ok(list[0].includes(T[l]('numbers_title')), `news_24 ${l} uses the page's name`)
    assert.ok(!list[0].includes('!') && !list[0].includes('—'), `news_24 ${l}`)
  }
})

test('v1.1.12 (news_25) comes right after 1.1.13, then 1.1.11, dated 2026-11-13, not big, three items naming the steps, Profile, More and Rewards in en, fr and es', () => {
  assert.ok(vNum('1.1.12') > vNum('1.1.11'))
  assert.equal(NEWS[1].v, '1.1.12')
  assert.equal(NEWS[1].key, 'news_25')
  assert.equal(NEWS[1].date, '2026-11-13')
  assert.ok(!NEWS[1].big, 'not big: no news dot')
  assert.ok(!NEWS[1].sum)
  assert.equal(timeline[1].v, '1.1.12')
  assert.equal(timeline[2].v, '1.1.11')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_25'))
    assert.equal(list.length, 3, `news_25 ${l}`)
    for (const k of ['home_start_unlock', 'home_finish_unlock', 'card_get']) assert.ok(list[0].includes(T[l](k)), `news_25 ${l} names ${k}`)
    assert.ok(list[1].includes(T[l]('tab_profile')), `news_25 ${l} uses the Profile tab's name`)
    assert.ok(list[2].includes(`${T[l]('tab_more')} > ${T[l]('legal_rewards')}`), `news_25 ${l} writes the path More > Rewards`)
    for (const it of list) assert.ok(!it.includes('!') && !it.includes('—'), `news_25 ${l}`)
  }
})

test('v1.1.13 (news_26) is the newest block, dated 2026-11-13, not big, two items naming More in en, fr and es', () => {
  assert.ok(vNum('1.1.13') > vNum('1.1.12'))
  assert.equal(NEWS[0].v, '1.1.13')
  assert.equal(NEWS[0].key, 'news_26')
  assert.equal(NEWS[0].date, '2026-11-13')
  assert.ok(!NEWS[0].big, 'not big: no news dot')
  assert.ok(!NEWS[0].sum)
  assert.equal(timeline[0].v, '1.1.13')
  assert.equal(timeline[1].v, '1.1.12')
  assert.equal(pkg.version, '1.1.13')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_26'))
    assert.equal(list.length, 2, `news_26 ${l}`)
    assert.ok(list[1].includes(T[l]('tab_more')), `news_26 ${l} names the More tab`)
    for (const it of list) assert.ok(!it.includes('!') && !it.includes('—'), `news_26 ${l}`)
  }
})
