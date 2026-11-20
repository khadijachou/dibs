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
// above, newest first, and the newest version is the app's version. Optional fields (big, sum, n, sheet) do not change it.
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
  assert.deepEqual(timeline.slice(25, 30).map((b) => b.v), ['1.1.3', '1.1.2', '1.1.1', '1.1', '1.0.10'])
  assert.deepEqual(timeline.slice(25, 29).map((b) => b.key), ['news_16', 'news_15', 'news_14', 'news_13'])
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_16')).length, 2, `news_16 ${l}`)
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_14')).length, 1, `news_14 ${l}`)
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_15')).length, 2, `news_15 ${l}`)
})

test('1.1.2 is not big: no dot on More for it', () => {
  assert.ok(!NEWS.find((b) => b.v === '1.1.2').big)
})

test('the big ones are 1.3, 1.2, 1.1.9 and 1.1.0, and the 1.1.0 summary says 5 new brands in en, fr and es', () => {
  assert.deepEqual(NEWS.filter((b) => b.big).map((b) => b.v), ['1.3', '1.2', '1.1.9', '1.1'])
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
  assert.equal(NEWS[24].v, '1.1.4')
  assert.equal(NEWS[24].key, 'news_17')
  assert.equal(NEWS[25].v, '1.1.3')
  assert.ok(!NEWS[24].big)
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_17')).length, 2, `news_17 ${l}`)
})

test('v1.1.5 (news_18) comes right after 1.1.6, then 1.1.4, dated 2026-11-13, not big, two items naming Profile in each language', () => {
  assert.ok(vNum('1.1.5') > vNum('1.1.4'))
  assert.equal(NEWS[23].v, '1.1.5')
  assert.equal(NEWS[23].key, 'news_18')
  assert.equal(NEWS[23].date, '2026-11-13')
  assert.ok(!NEWS[23].big)
  assert.equal(timeline[24].v, '1.1.4')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_18'))
    assert.equal(list.length, 2, `news_18 ${l}`)
    assert.ok(list[0].includes(T[l]('tab_profile')), `news_18 ${l} uses the tab name`)
  }
})

test('v1.1.6 (news_19) comes right after 1.1.7, then 1.1.5, dated 2026-11-13, not big, two items naming Profile and light mode', () => {
  assert.ok(vNum('1.1.6') > vNum('1.1.5'))
  assert.equal(NEWS[22].v, '1.1.6')
  assert.equal(NEWS[22].key, 'news_19')
  assert.equal(NEWS[22].date, '2026-11-13')
  assert.ok(!NEWS[22].big)
  assert.equal(timeline[22].v, '1.1.6')
  assert.equal(timeline[23].v, '1.1.5')
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
  assert.equal(NEWS[21].v, '1.1.7')
  assert.equal(NEWS[21].key, 'news_20')
  assert.equal(NEWS[21].date, '2026-11-13')
  assert.ok(!NEWS[21].big)
  assert.equal(timeline[21].v, '1.1.7')
  assert.equal(timeline[22].v, '1.1.6')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_20'))
    assert.equal(list.length, 1, `news_20 ${l}`)
    for (const b of ['Steam', 'Best Buy', 'Apple', 'Uber', 'Fortnite']) assert.ok(list[0].includes(b), `news_20 ${l} names ${b}`)
    assert.ok(!list[0].includes('Flightgift'), `news_20 ${l} does not name Flightgift`)
  }
})

test('v1.1.8 (news_21) comes right after 1.1.9, then 1.1.7, dated 2026-11-13, not big, two items in en, fr and es', () => {
  assert.ok(vNum('1.1.8') > vNum('1.1.7'))
  assert.equal(NEWS[20].v, '1.1.8')
  assert.equal(NEWS[20].key, 'news_21')
  assert.equal(NEWS[20].date, '2026-11-13')
  assert.ok(!NEWS[20].big, 'not big: no news dot')
  assert.equal(timeline[20].v, '1.1.8')
  assert.equal(timeline[21].v, '1.1.7')
  for (const l of ['en', 'fr', 'es']) assert.equal(items(T[l]('news_21')).length, 2, `news_21 ${l}`)
})

test('v1.1.9 (news_22) comes right after 1.1.10, then 1.1.8, dated 2026-11-13, big with a summary, one item in en, fr and es', () => {
  assert.ok(vNum('1.1.9') > vNum('1.1.8'))
  assert.equal(NEWS[19].v, '1.1.9')
  assert.equal(NEWS[19].key, 'news_22')
  assert.equal(NEWS[19].date, '2026-11-13')
  assert.equal(NEWS[19].big, true, 'big: the news dot lights up')
  assert.equal(NEWS[19].sum, 'news_sum_22')
  assert.equal(timeline[19].v, '1.1.9')
  assert.equal(timeline[20].v, '1.1.8')
  const want = { en: 'An important fix for unlocking', fr: 'Un correctif important pour le déblocage', es: 'Una corrección importante para el desbloqueo' }
  const start = { en: 'Fixed: ', fr: 'Corrigé : ', es: 'Corregido: ' }
  for (const l of ['en', 'fr', 'es']) {
    assert.equal(T[l](NEWS[19].sum, { n: NEWS[19].n }), want[l], l)
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
  assert.equal(NEWS[18].v, '1.1.10')
  assert.equal(NEWS[18].key, 'news_23')
  assert.equal(NEWS[18].date, '2026-11-13')
  assert.ok(!NEWS[18].big, 'not big: no news dot')
  assert.ok(!NEWS[18].sum)
  assert.equal(timeline[18].v, '1.1.10')
  assert.equal(timeline[19].v, '1.1.9')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_23'))
    assert.equal(list.length, 2, `news_23 ${l}`)
    assert.ok(list[1].includes(T[l]('goal_add_nim')), `news_23 ${l} uses the page's name`)
    for (const it of list) assert.ok(!it.includes('!') && !it.includes('—'), `news_23 ${l}`)
  }
})

test('v1.1.11 (news_24) comes right after 1.1.12, then 1.1.10, dated 2026-11-13, not big, one item naming Dibs in numbers in en, fr and es', () => {
  assert.ok(vNum('1.1.11') > vNum('1.1.10'))
  assert.equal(NEWS[17].v, '1.1.11')
  assert.equal(NEWS[17].key, 'news_24')
  assert.equal(NEWS[17].date, '2026-11-13')
  assert.ok(!NEWS[17].big, 'not big: no news dot')
  assert.ok(!NEWS[17].sum)
  assert.equal(timeline[17].v, '1.1.11')
  assert.equal(timeline[18].v, '1.1.10')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_24'))
    assert.equal(list.length, 1, `news_24 ${l}`)
    assert.ok(list[0].includes(T[l]('numbers_title')), `news_24 ${l} uses the page's name`)
    assert.ok(!list[0].includes('!') && !list[0].includes('—'), `news_24 ${l}`)
  }
})

test('v1.1.12 (news_25) comes right after 1.1.13, then 1.1.11, dated 2026-11-13, not big, three items naming the steps, Profile, More and Rewards in en, fr and es', () => {
  assert.ok(vNum('1.1.12') > vNum('1.1.11'))
  assert.equal(NEWS[16].v, '1.1.12')
  assert.equal(NEWS[16].key, 'news_25')
  assert.equal(NEWS[16].date, '2026-11-13')
  assert.ok(!NEWS[16].big, 'not big: no news dot')
  assert.ok(!NEWS[16].sum)
  assert.equal(timeline[16].v, '1.1.12')
  assert.equal(timeline[17].v, '1.1.11')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_25'))
    assert.equal(list.length, 3, `news_25 ${l}`)
    for (const k of ['home_start_unlock', 'home_finish_unlock', 'card_get']) assert.ok(list[0].includes(T[l](k)), `news_25 ${l} names ${k}`)
    assert.ok(list[1].includes(T[l]('tab_profile')), `news_25 ${l} uses the Profile tab's name`)
    assert.ok(list[2].includes(`${T[l]('tab_more')} > ${T[l]('legal_rewards')}`), `news_25 ${l} writes the path More > Rewards`)
    for (const it of list) assert.ok(!it.includes('!') && !it.includes('—'), `news_25 ${l}`)
  }
})

test('v1.1.13 (news_26) comes right after 1.2, then 1.1.12, dated 2026-11-13, not big, two items naming More in en, fr and es', () => {
  assert.ok(vNum('1.1.13') > vNum('1.1.12'))
  assert.equal(NEWS[15].v, '1.1.13')
  assert.equal(NEWS[15].key, 'news_26')
  assert.equal(NEWS[15].date, '2026-11-13')
  assert.ok(!NEWS[15].big, 'not big: no news dot')
  assert.ok(!NEWS[15].sum)
  assert.equal(timeline[15].v, '1.1.13')
  assert.equal(timeline[16].v, '1.1.12')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_26'))
    assert.equal(list.length, 2, `news_26 ${l}`)
    assert.ok(list[1].includes(T[l]('tab_more')), `news_26 ${l} names the More tab`)
    for (const it of list) assert.ok(!it.includes('!') && !it.includes('—'), `news_26 ${l}`)
  }
})

test('v1.2 (news_27) comes right after 1.2.1, then 1.1.13, big with a summary, three items in en, fr and es', () => {
  assert.ok(vNum('1.2') > vNum('1.1.13'))
  assert.equal(NEWS[14].v, '1.2')
  assert.equal(NEWS[14].key, 'news_27')
  assert.equal(NEWS[14].date, '2026-11-14')
  assert.equal(NEWS[14].big, true, 'big: the news dot lights up')
  assert.equal(NEWS[14].sum, 'news_sum_27')
  assert.equal(timeline[14].v, '1.2')
  assert.equal(timeline[15].v, '1.1.13')
  const want = { en: 'Daily quests are here', fr: 'Les quêtes du jour sont là', es: 'Llegan las misiones diarias' }
  for (const l of ['en', 'fr', 'es']) {
    assert.equal(T[l](NEWS[14].sum, { n: NEWS[14].n }), want[l], l)
    const list = items(T[l]('news_27'))
    assert.equal(list.length, 3, `news_27 ${l}`)
    assert.ok(list[0].includes(T[l]('quests_title')), `news_27 ${l} names Quests`)
    for (const it of list) assert.ok(!it.includes('!') && !it.includes('—'), `news_27 ${l}`)
  }
})

test('v1.2.1 (news_28) comes right after 1.2.2, then 1.2, dated 2026-11-14, not big, two items in en, fr and es', () => {
  assert.ok(vNum('1.2.1') > vNum('1.2'))
  assert.equal(NEWS[13].v, '1.2.1')
  assert.equal(NEWS[13].key, 'news_28')
  assert.equal(NEWS[13].date, '2026-11-14')
  assert.ok(!NEWS[13].big, 'not big: no news dot')
  assert.ok(!NEWS[13].sum)
  assert.equal(timeline[13].v, '1.2.1')
  assert.equal(timeline[14].v, '1.2')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_28'))
    assert.equal(list.length, 2, `news_28 ${l}`)
    // "Dibs!" is the one allowed exclamation; no other "!" and no em dash.
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), `news_28 ${l}`)
  }
})

test('v1.2.2 (news_29) comes right after 1.2.3, then 1.2.1, dated 2026-11-14, not big, two items in en, fr and es', () => {
  assert.ok(vNum('1.2.2') > vNum('1.2.1'))
  assert.equal(NEWS[12].v, '1.2.2')
  assert.equal(NEWS[12].key, 'news_29')
  assert.equal(NEWS[12].date, '2026-11-14')
  assert.ok(!NEWS[12].big, 'not big: someone who saw 1.2 gets no dot')
  assert.ok(!NEWS[12].sum)
  assert.equal(timeline[12].v, '1.2.2')
  assert.equal(timeline[13].v, '1.2.1')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_29'))
    assert.equal(list.length, 2, `news_29 ${l}`)
    // "Dibs!" is the one allowed exclamation; no other "!" and no em dash.
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), `news_29 ${l}`)
  }
})

test('v1.2.3 (news_30) comes right after 1.2.4, then 1.2.2, dated 2026-11-14, not big, two items in en, fr and es', () => {
  assert.ok(vNum('1.2.3') > vNum('1.2.2'))
  assert.equal(NEWS[11].v, '1.2.3')
  assert.equal(NEWS[11].key, 'news_30')
  assert.equal(NEWS[11].date, '2026-11-14')
  assert.ok(!NEWS[11].big, 'not big: someone who saw 1.2 gets no dot')
  assert.ok(!NEWS[11].sum)
  assert.equal(timeline[11].v, '1.2.3')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_30'))
    assert.equal(list.length, 2, `news_30 ${l}`)
    // "Dibs!" is the one allowed exclamation; no other "!" and no em dash.
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), `news_30 ${l}`)
  }
})

test('v1.2.4 (news_31) comes right after 1.2.5, then 1.2.3, dated 2026-11-14, not big, three items in en, fr and es', () => {
  assert.ok(vNum('1.2.4') > vNum('1.2.3'))
  assert.equal(NEWS[10].v, '1.2.4')
  assert.equal(NEWS[10].key, 'news_31')
  assert.equal(NEWS[10].date, '2026-11-14')
  assert.ok(!NEWS[10].big, 'not big: no news dot')
  assert.ok(!NEWS[10].sum)
  assert.equal(timeline[10].v, '1.2.4')
  assert.equal(timeline[11].v, '1.2.3')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_31'))
    assert.equal(list.length, 3, 'news_31 ' + l)
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), 'news_31 ' + l)
  }
})

test('v1.2.5 (news_32) comes right after 1.2.6, then 1.2.4, dated 2026-11-15, not big, two items in en, fr and es', () => {
  assert.ok(vNum('1.2.5') > vNum('1.2.4'))
  assert.equal(NEWS[9].v, '1.2.5')
  assert.equal(NEWS[9].key, 'news_32')
  assert.equal(NEWS[9].date, '2026-11-15')
  assert.ok(!NEWS[9].big, 'not big: no news dot')
  assert.ok(!NEWS[9].sum)
  assert.equal(timeline[9].v, '1.2.5')
  assert.equal(timeline[10].v, '1.2.4')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_32'))
    assert.equal(list.length, 2, 'news_32 ' + l)
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), 'news_32 ' + l)
  }
})

test('v1.2.6 (news_33) comes right after 1.2.7, then 1.2.5, dated 2026-11-15, not big, two items in en, fr and es', () => {
  assert.ok(vNum('1.2.6') > vNum('1.2.5'))
  assert.equal(NEWS[8].v, '1.2.6')
  assert.equal(NEWS[8].key, 'news_33')
  assert.equal(NEWS[8].date, '2026-11-15')
  assert.ok(!NEWS[8].big, 'not big: no news dot')
  assert.ok(!NEWS[8].sum)
  assert.equal(timeline[8].v, '1.2.6')
  assert.equal(timeline[9].v, '1.2.5')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_33'))
    assert.equal(list.length, 2, 'news_33 ' + l)
    // "Did you know?" is a question, not an exclamation: no "!" and no em dash.
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), 'news_33 ' + l)
  }
})

test('v1.2.7 (news_34) comes right after 1.2.8, then 1.2.6, dated 2026-11-15, not big, one item in en, fr and es', () => {
  assert.ok(vNum('1.2.7') > vNum('1.2.6'))
  assert.equal(NEWS[7].v, '1.2.7')
  assert.equal(NEWS[7].key, 'news_34')
  assert.equal(NEWS[7].date, '2026-11-15')
  assert.ok(!NEWS[7].big, 'not big: no news dot')
  assert.ok(!NEWS[7].sum)
  assert.equal(timeline[7].v, '1.2.7')
  assert.equal(timeline[8].v, '1.2.6')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_34'))
    assert.equal(list.length, 1, 'news_34 ' + l)
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), 'news_34 ' + l)
  }
})

test('v1.2.8 (news_35) comes right after 1.2.9, then 1.2.7, dated 2026-11-15, not big, one item in en, fr and es', () => {
  assert.ok(vNum('1.2.8') > vNum('1.2.7'))
  assert.equal(NEWS[6].v, '1.2.8')
  assert.equal(NEWS[6].key, 'news_35')
  assert.equal(NEWS[6].date, '2026-11-15')
  assert.ok(!NEWS[6].big, 'not big: no news dot')
  assert.ok(!NEWS[6].sum)
  assert.equal(timeline[6].v, '1.2.8')
  assert.equal(timeline[7].v, '1.2.7')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_35'))
    assert.equal(list.length, 1, 'news_35 ' + l)
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), 'news_35 ' + l)
  }
})

test('v1.2.9 (news_36) comes right after 1.2.10, then 1.2.8, dated 2026-11-15, not big, two items in en, fr and es', () => {
  assert.ok(vNum('1.2.9') > vNum('1.2.8'))
  assert.equal(NEWS[5].v, '1.2.9')
  assert.equal(NEWS[5].key, 'news_36')
  assert.equal(NEWS[5].date, '2026-11-15')
  assert.ok(!NEWS[5].big, 'not big: no news dot')
  assert.ok(!NEWS[5].sum)
  assert.equal(timeline[5].v, '1.2.9')
  assert.equal(timeline[6].v, '1.2.8')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_36'))
    assert.equal(list.length, 2, 'news_36 ' + l)
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), 'news_36 ' + l)
  }
})

test('v1.2.10 (news_37) comes right after 1.2.11, then 1.2.9, dated 2026-11-15, not big, one item in en, fr and es', () => {
  assert.ok(vNum('1.2.10') > vNum('1.2.9'))
  assert.equal(NEWS[4].v, '1.2.10')
  assert.equal(NEWS[4].key, 'news_37')
  assert.equal(NEWS[4].date, '2026-11-15')
  assert.ok(!NEWS[4].big, 'not big: no news dot')
  assert.ok(!NEWS[4].sum)
  assert.equal(timeline[4].v, '1.2.10')
  assert.equal(timeline[5].v, '1.2.9')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_37'))
    assert.equal(list.length, 1, 'news_37 ' + l)
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), 'news_37 ' + l)
  }
})

test('v1.2.11 (news_38) comes right after 1.3, then 1.2.10, dated 2026-11-15, not big, one item in en, fr and es', () => {
  assert.ok(vNum('1.2.11') > vNum('1.2.10'))
  assert.equal(NEWS[3].v, '1.2.11')
  assert.equal(NEWS[3].key, 'news_38')
  assert.equal(NEWS[3].date, '2026-11-15')
  assert.ok(!NEWS[3].big, 'not big: no news dot')
  assert.ok(!NEWS[3].sum)
  assert.equal(timeline[3].v, '1.2.11')
  assert.equal(timeline[4].v, '1.2.10')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_38'))
    assert.equal(list.length, 1, 'news_38 ' + l)
    // Names Savings in each language, no "!" and no em dash.
    assert.ok(list[0].includes(T[l]('tab_stake')), `news_38 ${l} names Savings`)
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), 'news_38 ' + l)
  }
})

test('v1.3.2 (news_41) is the newest block, index 0, dated 2026-11-20, the app version, not big, no sum, no sheet, two items in en, fr and es', () => {
  assert.ok(vNum('1.3.2') > vNum('1.3.1'))
  assert.equal(NEWS[0].v, '1.3.2')
  assert.equal(NEWS[0].key, 'news_41')
  assert.equal(NEWS[0].date, '2026-11-20')
  assert.ok(!NEWS[0].big, 'not big: someone who already saw 1.3 gets no dot')
  assert.ok(!NEWS[0].sum)
  assert.ok(!('sheet' in NEWS[0]), 'no big-update sheet for 1.3.2')
  assert.equal(timeline[0].v, '1.3.2')
  assert.equal(timeline[1].v, '1.3.1')
  assert.equal(pkg.version, '1.3.2')
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_41'))
    assert.equal(list.length, 2, `news_41 ${l}`)
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), `news_41 ${l}`)
  }
})

test('v1.3.1 (news_40) comes right after 1.3.2, then 1.3, dated 2026-11-20, not big, no sum, no sheet, four items in en, fr and es', () => {
  assert.ok(vNum('1.3.1') > vNum('1.3'))
  assert.equal(NEWS[1].v, '1.3.1')
  assert.equal(NEWS[1].key, 'news_40')
  assert.equal(NEWS[1].date, '2026-11-20')
  assert.ok(!NEWS[1].big, 'not big: someone who already saw 1.3 gets no dot')
  assert.ok(!NEWS[1].sum)
  assert.ok(!('sheet' in NEWS[1]), 'no big-update sheet for 1.3.1')
  assert.equal(timeline[1].v, '1.3.1')
  assert.equal(timeline[2].v, '1.3')
  // Names Appearance, More and Savings in each language, four items, no "!" and no em dash.
  const names = { en: ['Appearance', 'More', 'Savings'], fr: ['Apparence', 'Plus', 'Épargne'], es: ['Apariencia', 'Más', 'Ahorros'] }
  for (const l of ['en', 'fr', 'es']) {
    const list = items(T[l]('news_40'))
    assert.equal(list.length, 4, `news_40 ${l}`)
    for (const name of names[l]) assert.ok(T[l]('news_40').includes(name), `news_40 ${l} names ${name}`)
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), `news_40 ${l}`)
  }
})

test('v1.3 (news_39) comes right after 1.3.1, then 1.2.11, dated 2026-11-20, big with a summary, five items in en, fr and es', () => {
  assert.ok(vNum('1.3') > vNum('1.2.11'))
  assert.equal(NEWS[2].v, '1.3')
  assert.equal(NEWS[2].key, 'news_39')
  assert.equal(NEWS[2].date, '2026-11-20')
  assert.equal(NEWS[2].big, true, 'big: the news dot lights up')
  assert.equal(NEWS[2].sum, 'news_sum_39')
  assert.equal(timeline[2].v, '1.3')
  assert.equal(timeline[3].v, '1.2.11')
  const want = { en: 'See your saving: Insights, a weekly recap and your month to share.', fr: 'Votre épargne en un coup d’œil : Statistiques, un bilan chaque semaine et votre mois à partager.', es: 'Tu ahorro de un vistazo: Estadísticas, un resumen cada semana y tu mes para compartir.' }
  for (const l of ['en', 'fr', 'es']) {
    assert.equal(T[l](NEWS[2].sum, { n: NEWS[2].n }), want[l], l)
    const list = items(T[l]('news_39'))
    assert.equal(list.length, 5, `news_39 ${l}`)
    for (const it of list) assert.ok(!it.replace(/Dibs!/g, '').includes('!') && !it.includes('—'), `news_39 ${l}`)
  }
})

// The big-update sheet (components/WhatsNewSheet.jsx) is driven by a release's optional `sheet` field (lib/news.js).
// Exactly one release carries content: 1.3 (three rows). No other entry carries a sheet.
test('exactly one release carries a sheet: 1.3 with three rows', () => {
  const withSheet = NEWS.filter((b) => 'sheet' in b)
  assert.equal(withSheet.length, 1)
  assert.equal(withSheet[0].v, '1.3')
  assert.equal(withSheet[0].sheet.length, 3)
  assert.deepEqual(withSheet[0].sheet.map((r) => r.icon), ['chart', 'bell', 'share'])
  assert.deepEqual(withSheet[0].sheet.map((r) => r.go || null), ['insights', 'home', null])
})
