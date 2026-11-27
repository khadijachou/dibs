import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeT } from './i18n.js'
import { detailText, fromText, itemLabel, keepTail, localName } from './itemName.js'

const NBSP = String.fromCharCode(0xa0)
const plain = (s) => s.replaceAll(NBSP, ' ')

test('amounts follow the language', () => {
  assert.equal(plain(detailText(makeT('en'), { detail: '9.99 USD' })), '9.99 USD')
  assert.equal(plain(detailText(makeT('fr'), { detail: '9.99 USD' })), '9,99 USD')
  assert.equal(plain(detailText(makeT('es'), { detail: '25 EUR' })), '25 EUR')
})

test('a duration item shows the duration translated and its price', () => {
  const nitro = { detail: '1 Year', usd: 101.99, items: null }
  assert.equal(plain(detailText(makeT('en'), nitro)), '1 Year · 101.99 USD')
  assert.equal(plain(detailText(makeT('fr'), nitro)), '1 an · 101,99 USD')
  assert.equal(plain(detailText(makeT('es'), nitro)), '1 año · 101,99 USD')
  assert.equal(plain(detailText(makeT('fr'), nitro, { short: true })), '1 an')
  assert.equal(plain(detailText(makeT('es'), { detail: '3 Months', usd: 29.97 })), '3 meses · 29,97 USD')
})

test('tile price line and goal label', () => {
  const t = makeT('fr')
  assert.equal(plain(fromText(t, { items: [{ detail: '9.99 USD' }, { detail: '49.99 USD' }] })), 'Dès 9,99 USD')
  assert.equal(plain(fromText(t, { items: [{ detail: '1 Year', usd: 101.99 }] })), '1 an · 101,99 USD')
  assert.equal(plain(itemLabel(makeT('es'), { itemName: 'Discord Nitro', itemDetail: '1 Year', usd: 101.99 })), 'Discord Nitro · 1 año · 101,99 USD')
  assert.equal(plain(itemLabel(t, { itemName: 'Steam gift card', itemDetail: '20 USD', usd: 22.48 })), 'Carte-cadeau Steam · 20 USD')
})

test('a plan value that repeats the brand drops the brand prefix, then reads as a duration', () => {
  // Surfshark values are "Surfshark 1M" etc.; the tile already shows the brand, so only "1M" is kept, and
  // "1M" / "1Y" / "2Y" are read as durations (translated).
  const t = makeT('en')
  // Goal path: the stored brandName is used.
  assert.equal(detailText(t, { brandName: 'Surfshark', itemDetail: 'Surfshark 1M' }), '1 Month')
  assert.equal(detailText(t, { brandName: 'Surfshark', detail: 'Surfshark 1Y' }), '1 Year')
  // Catalogue-item path: the brand is resolved from the item's shopUrl (brandOf).
  assert.equal(detailText(t, { shopUrl: 'https://www.bitrefill.com/surfshark-vpn-international/', detail: 'Surfshark 2Y' }), '2 Years')
  // fromText (tile "From ...") shows "From 1 Month" when the brand has several durations.
  assert.equal(fromText(t, { name: 'Surfshark VPN', items: [{ brandName: 'Surfshark', detail: 'Surfshark 1M' }, { brandName: 'Surfshark', detail: 'Surfshark 1Y' }] }), 'From 1 Month')
  // An amount value is unaffected either way.
  assert.equal(plain(detailText(t, { brandName: 'ChatGPT', detail: '20 USD' })), '20 USD')
})

test('shop plan labels are read as durations and translated (NordPass, Surfshark, ExitLag); other text is left as is', () => {
  const en = makeT('en')
  const fr = makeT('fr')
  // NordPass "1 Year Subscription" / "2 Years Subscription": drop the " Subscription" suffix, then the duration.
  assert.equal(plain(detailText(en, { brandName: 'NordPass', detail: '1 Year Subscription' })), '1 Year')
  assert.equal(plain(detailText(fr, { brandName: 'NordPass', detail: '1 Year Subscription' })), '1 an')
  assert.equal(plain(detailText(en, { brandName: 'NordPass', detail: '2 Years Subscription' })), '2 Years')
  assert.equal(plain(detailText(fr, { brandName: 'NordPass', detail: '2 Years Subscription' })), '2 ans')
  // Surfshark short forms, in fr.
  assert.equal(plain(detailText(fr, { brandName: 'Surfshark', detail: 'Surfshark 1M' })), '1 mois')
  assert.equal(plain(detailText(fr, { brandName: 'Surfshark', detail: 'Surfshark 2Y' })), '2 ans')
  // ExitLag "Semiannual" = 6 months, "Annual" = 1 year.
  assert.equal(plain(detailText(en, { brandName: 'ExitLag', detail: 'Semiannual' })), '6 Months')
  assert.equal(plain(detailText(fr, { brandName: 'ExitLag', detail: 'Semiannual' })), '6 mois')
  assert.equal(plain(detailText(en, { brandName: 'ExitLag', detail: 'Annual' })), '1 Year')
  assert.equal(plain(detailText(fr, { brandName: 'ExitLag', detail: 'Annual' })), '1 an')
  // An unmatched plan is shown exactly as the shop wrote it (Office "365 Personal").
  assert.equal(detailText(en, { brandName: 'Microsoft Office', detail: '365 Personal' }), '365 Personal')
  assert.equal(detailText(fr, { brandName: 'Microsoft Office', detail: '365 Personal' }), '365 Personal')
})

test('stored labels keep number and currency together', () => {
  const s = localName(makeT('fr'), 'Netflix · 25 EUR')
  assert.equal(s, `Netflix · 25${NBSP}EUR`)
})

test('keepTail glues the card-type words and the value so the name wraps earlier', () => {
  const g = { itemName: 'Nintendo eShop gift card', itemDetail: '20 USD', usd: 22 }
  // en: "gift card · 20 USD" stays on one piece, only the name's own spaces still break.
  assert.equal(keepTail(itemLabel(makeT('en'), g)), `Nintendo eShop gift${NBSP}card${NBSP}·${NBSP}20${NBSP}USD`)
  // fr: card type "Carte-cadeau" leads, so only the "· value" tail is glued.
  assert.equal(keepTail(itemLabel(makeT('fr'), g)), `Carte-cadeau Nintendo eShop${NBSP}·${NBSP}20${NBSP}USD`)
  // es: "Tarjeta de regalo" is kept whole too.
  assert.equal(keepTail(itemLabel(makeT('es'), g)), `Tarjeta${NBSP}de${NBSP}regalo Nintendo eShop${NBSP}·${NBSP}20${NBSP}USD`)
  // Only normal spaces (break points) left are inside the name, never a lone "·" at the end of a line.
  for (const lang of ['en', 'fr', 'es']) {
    const parts = keepTail(itemLabel(makeT(lang), g)).split(' ')
    assert.ok(parts.every((p) => !/·$/.test(p)))
  }
})

test('keepTail on a plan card without a numeric value glues the last word, the dot and the value', () => {
  // Duration with no price (usd null): detailText is "1 Year", no card-type words.
  const label = itemLabel(makeT('en'), { itemName: 'Discord Nitro', itemDetail: '1 Year' })
  assert.equal(plain(label), 'Discord Nitro · 1 Year')
  assert.equal(keepTail(label), `Discord Nitro${NBSP}·${NBSP}1${NBSP}Year`)
})
