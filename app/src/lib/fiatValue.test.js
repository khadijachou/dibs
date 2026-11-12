import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fiatCode, fmtFiatValue, pickFiat } from './fiatValue.js'

const NBSP = String.fromCharCode(0xa0)

test('USD: two decimals below 1,000', () => {
  assert.equal(fmtFiatValue(25145, { code: 'USD', rate: 0.00024049 }, 'en'), '$6.05')
  assert.equal(fmtFiatValue(1250000, { code: 'USD', rate: 0.0002406 }, 'en'), '$300.75')
})

test('EUR in each language', () => {
  const eur = { code: 'EUR', rate: 0.00021716 }
  assert.equal(fmtFiatValue(25145, eur, 'en'), '€5.46')
  assert.equal(fmtFiatValue(25145, eur, 'fr'), `5,46${NBSP}€`)
  assert.equal(fmtFiatValue(25145, eur, 'es'), `5,46${NBSP}€`)
})

test('no decimals from 1,000 up, in every currency', () => {
  assert.equal(fmtFiatValue(10_000_000, { code: 'USD', rate: 0.0002406 }, 'en'), '$2,406')
  assert.equal(fmtFiatValue(1_250_000, { code: 'CRC', rate: 0.11 }, 'en'), `CRC${NBSP}137,500`)
  assert.equal(fmtFiatValue(1_250_000, { code: 'CRC', rate: 0.11 }, 'fr'), `137${NBSP}500${NBSP}CRC`)
  // 999.996 rounds to 1,000.00: shown as 1,000, not 1,000.00
  assert.equal(fmtFiatValue(999.996, { code: 'USD', rate: 1 }, 'en'), '$1,000')
  assert.equal(fmtFiatValue(999.99, { code: 'USD', rate: 1 }, 'en'), '$999.99')
})

test('a zero balance is a value', () => {
  assert.equal(fmtFiatValue(0, { code: 'USD', rate: 0.00024 }, 'en'), '$0.00')
})

test('nothing to show: missing rate, no balance', () => {
  assert.equal(fmtFiatValue(25145, null, 'en'), null)
  assert.equal(fmtFiatValue(25145, { code: 'EUR' }, 'en'), null)
  assert.equal(fmtFiatValue(25145, { code: 'EUR', rate: 0 }, 'en'), null)
  assert.equal(fmtFiatValue(null, { code: 'USD', rate: 0.00024 }, 'en'), null)
  assert.equal(fmtFiatValue(undefined, { code: 'USD', rate: 0.00024 }, 'en'), null)
})

test('pickFiat: own currency when it came back, else USD, else null', () => {
  assert.deepEqual(pickFiat({ usd: 0.00024, eur: 0.00022 }, 'EUR'), { code: 'EUR', rate: 0.00022 })
  assert.deepEqual(pickFiat({ usd: 0.00024 }, 'GMD'), { code: 'USD', rate: 0.00024 })
  assert.deepEqual(pickFiat({ usd: 0.00024 }, 'USD'), { code: 'USD', rate: 0.00024 })
  assert.equal(pickFiat({}, 'EUR'), null)
  assert.equal(pickFiat(undefined, 'USD'), null)
})

test('fiatCode keeps three letters, anything else is USD', () => {
  assert.equal(fiatCode('eur'), 'EUR')
  assert.equal(fiatCode(undefined), 'USD')
  assert.equal(fiatCode('EU&x=1'), 'USD')
})

test('no narrow no-break space in any output', () => {
  for (const lang of ['en', 'fr', 'es']) assert.ok(!fmtFiatValue(1_250_000, { code: 'CRC', rate: 0.11 }, lang).includes(String.fromCharCode(0x202f)))
})
