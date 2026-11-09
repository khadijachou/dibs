import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeT } from './i18n.js'
import { detailText, fromText, itemLabel } from './itemName.js'

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
