// More screen (screens/More.jsx): row order, the website row, and its strings. More.jsx is JSX, so it is read as text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeT } from './i18n.js'

const more = readFileSync(new URL('../screens/More.jsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('./i18n.js', import.meta.url), 'utf8')
const T = { en: makeT('en'), fr: makeT('fr'), es: makeT('es') }
const pos = (s) => { const i = more.indexOf(s); assert.ok(i >= 0, `${s} is in More.jsx`); return i }

test('the website row opens and copies the same constant, WEB_URL', () => {
  const m = more.match(/const WEB_URL = '([^']+)'/)
  assert.ok(m, 'WEB_URL is defined once')
  assert.equal(m[1], 'https://calldibs-ashen.vercel.app/')
  assert.equal(more.split("'https://calldibs-ashen.vercel.app/'").length, 2, 'the address is written only in WEB_URL')
  assert.match(more, /href=\{WEB_URL\} target="_blank" rel="noopener noreferrer" onClick=\{visitWeb\}/)
  assert.match(more, /const visitWeb = \(\) => \{ copyText\(WEB_URL\)\.then\(\(ok\) => \{ if \(ok\) toast\(t\('web_copied'\)\) \}\) \}/)
  assert.ok(!/visitWeb[^\n]*preventDefault/.test(more), 'no preventDefault: a new tab still opens')
  for (const l of ['en', 'fr', 'es']) assert.ok(T[l]('web_copied').includes('calldibs-ashen.vercel.app'), `web_copied ${l} names the address`)
})

test('first group: How it works, Rewards, Catalog, Share, X, website, FAQ; Legal: Privacy, Terms, What\'s new', () => {
  const first = ["t('more_howto')", "t('legal_rewards')", "t('browse_more')", "t('share_row')", "t('follow_row')", "t('web_row')", "t('more_faq')"].map(pos)
  for (let i = 1; i < first.length; i++) assert.ok(first[i] > first[i - 1], `row ${i} is in order`)
  const legal = ["t('more_legal')", "t('legal_privacy')", "t('legal_terms')", "t('legal_news')"].map(pos)
  for (let i = 1; i < legal.length; i++) assert.ok(legal[i] > legal[i - 1], `legal row ${i} is in order`)
  assert.ok(first.at(-1) < legal[0], 'Rewards is no longer under Legal')
  assert.equal(more.split("t('legal_rewards')").length, 2, 'one Rewards row')
})

test('no line under Your name, and name_device is gone from i18n', () => {
  assert.ok(!more.includes('name_device'))
  assert.ok(!i18n.includes('name_device'))
})

test('second lines: short Catalog line, X and website rows say tap to copy', () => {
  const want = {
    en: ['12 brands to choose from', 'Tap to copy the link'],
    fr: ['12 marques au choix', 'Touchez pour copier le lien'],
    es: ['12 marcas para elegir', 'Toca para copiar el enlace'],
  }
  for (const l of ['en', 'fr', 'es']) {
    assert.equal(T[l]('browse_more_sub', { count: 12 }), want[l][0], l)
    assert.equal(T[l]('follow_row_sub'), want[l][1], l)
    assert.equal(T[l]('web_row_sub'), want[l][1], l)
  }
  assert.match(more, /t\('browse_more_sub', \{ count: catalogBrands\(\)\.length \}\)/)
})

test('Privacy "On your phone" ends with the name sentence in en, fr and es', () => {
  const end = {
    en: 'Dibs never sends your name anywhere: not with usage stats, not with a purchase.',
    fr: 'Dibs n’envoie jamais votre nom nulle part : ni avec les statistiques d’utilisation, ni lors d’un achat.',
    es: 'Dibs nunca envía tu nombre a ningún lado: ni con las estadísticas de uso, ni con una compra.',
  }
  for (const l of ['en', 'fr', 'es']) assert.ok(T[l]('privacy_1b').endsWith(end[l]), l)
})
