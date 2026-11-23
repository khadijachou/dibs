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
