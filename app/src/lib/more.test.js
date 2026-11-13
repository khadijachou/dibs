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

test('v1.1.12 order: numbers, Rewards, Discover, Community, Settings, About, Need help?, then the version line', () => {
  const order = ['<NumbersCard />', "t('legal_rewards')",
    "t('more_discover')", "t('more_howto')", "t('browse_more')", "t('more_faq')",
    "t('more_community')", "t('share_row')", "t('follow_row')", "t('web_row')",
    "t('more_settings')", '<NameRow />', "t('accounts_row')", "t('prefs_row')",
    "t('more_about')", "t('legal_news')", "t('legal_privacy')", "t('legal_terms')",
    "t('help_title')", "t('help_body')", 'HELP_EMAIL}</button>', "t('legal_version'"].map(pos)
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `row ${i} is in order`)
  assert.equal(more.split("t('legal_rewards')").length, 2, 'one Rewards row')
  assert.ok(!more.includes('more_legal') && !i18n.includes('more_legal'), 'the Legal group is gone')
})

test('the Rewards row is special, hidden once the program is over, with the end date from lib/rewards.js', () => {
  assert.match(more, /\{rewardsActive\(\) && \(\s*<button type="button" className="sheet-row rw-special" onClick=\{\(\) => go\('legal', \{ page: 'rewards' \}\)\}>/)
  assert.match(more, /t\('rw_until', \{ date: endShort\(lang\) \}\)/)
  assert.match(more, /new Date\(PROGRAM_END\)/)
  const tag = { en: 'Until Nov 30', fr: 'Jusqu’au 30 nov.', es: 'Hasta el 30 nov' }
  const fmt = (l) => new Intl.DateTimeFormat(l, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date('2026-11-30T23:59:59Z'))
  for (const l of ['en', 'fr', 'es']) assert.equal(T[l]('rw_until', { date: fmt(l) }), tag[l], l)
})

test('no line under Your name, and name_device is gone from i18n', () => {
  assert.ok(!more.includes('name_device'))
  assert.ok(!i18n.includes('name_device'))
})

test('second lines: short Catalog line, the X and website rows both say tap to copy (one key, follow_row_sub)', () => {
  const want = {
    en: ['12 brands to choose from', 'Tap to copy the link'],
    fr: ['12 marques au choix', 'Touchez pour copier le lien'],
    es: ['12 marcas para elegir', 'Toca para copiar el enlace'],
  }
  for (const l of ['en', 'fr', 'es']) {
    assert.equal(T[l]('browse_more_sub', { count: 12 }), want[l][0], l)
    assert.equal(T[l]('follow_row_sub'), want[l][1], l)
  }
  assert.match(more, /t\('browse_more_sub', \{ count: catalogBrands\(\)\.length \}\)/)
  assert.equal(more.split("t('follow_row_sub')").length, 3, 'the X row and the website row')
  assert.ok(!more.includes('web_row_sub') && !i18n.includes('web_row_sub'), 'web_row_sub is gone')
})

test('Privacy "On your phone" ends with the name sentence in en, fr and es', () => {
  const end = {
    en: 'Dibs never sends your name anywhere: not with usage stats, not with a purchase.',
    fr: 'Dibs n’envoie jamais votre nom nulle part : ni avec les statistiques d’utilisation, ni lors d’un achat.',
    es: 'Dibs nunca envía tu nombre a ningún lado: ni con las estadísticas de uso, ni con una compra.',
  }
  for (const l of ['en', 'fr', 'es']) assert.ok(T[l]('privacy_1b').endsWith(end[l]), l)
})
