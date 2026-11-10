import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtAmount, fmtEarned, fmtNim, fmtPct, fmtUsd } from './format.js'

const NNBSP = String.fromCharCode(0x202f)
const NBSP = String.fromCharCode(0xa0)

test('USD from 1 up always has 2 decimals', () => {
  assert.equal(fmtUsd(10.5, 'en'), '10.50')
  assert.equal(fmtUsd(56.23, 'en'), '56.23')
  assert.equal(fmtUsd(10.5, 'fr'), '10,50')
})

test('the NIM rate keeps 3 significant digits', () => {
  assert.equal(fmtUsd(0.00027, 'en'), '0.000270')
  assert.equal(fmtUsd(0.0012345, 'es'), '0,00123')
})

test('no narrow no-break space in any output', () => {
  for (const lang of ['en', 'fr', 'es']) {
    for (const s of [fmtNim(1234567, lang), fmtUsd(1234.5, lang), fmtPct(0.68, lang)]) assert.ok(!s.includes(NNBSP), `${lang}: ${s}`)
  }
  assert.equal(fmtNim(123456, 'fr'), `123${NBSP}456`)
  assert.equal(fmtPct(0.68, 'fr'), `68${NBSP}%`)
})

test('NIM is a whole number', () => {
  assert.equal(fmtNim(1234.9, 'en'), '1,234')
})

test('card face values: whole stays whole, decimals in the language', () => {
  assert.equal(fmtAmount('50', 'en'), '50')
  assert.equal(fmtAmount('9.99', 'en'), '9.99')
  assert.equal(fmtAmount('9.99', 'fr'), '9,99')
  assert.equal(fmtAmount('9.99', 'es'), '9,99')
  assert.equal(fmtAmount('1000', 'fr'), `1${NBSP}000`)
})

test('earned: whole from 10, 2 decimals below, < 0.01 for crumbs, never rounded up', () => {
  assert.equal(fmtEarned(24263.9, 'en'), '+24,263')
  assert.equal(fmtEarned(10, 'en'), '+10')
  assert.equal(fmtEarned(9.999, 'en'), '+9.99')
  assert.equal(fmtEarned(0.04, 'en'), '+0.04')
  assert.equal(fmtEarned(0.04, 'fr'), '+0,04')
  assert.equal(fmtEarned(0.009, 'en'), '<' + NBSP + '0.01')
  assert.equal(fmtEarned(0.00001, 'es'), '<' + NBSP + '0,01')
  assert.equal(fmtEarned(0, 'en'), '0')
})
