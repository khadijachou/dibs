import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
let blocked = false
const guard = () => { if (blocked) throw new Error('SecurityError') }
globalThis.localStorage = {
  getItem: (k) => { guard(); return store.has(k) ? store.get(k) : null },
  setItem: (k, v) => { guard(); store.set(k, String(v)) },
  removeItem: (k) => { guard(); store.delete(k) },
  clear: () => store.clear(),
}

const { CURRENCIES, getCurrency, setCurrency, effectiveCurrency, regionForCurrency, _resetCurrencyForTest } = await import('./currency.js')

beforeEach(() => { store.clear(); blocked = false; _resetCurrencyForTest() })

test('default is auto; the five choices are kept; anything else is auto', () => {
  assert.deepEqual(CURRENCIES, ['auto', 'USD', 'EUR', 'GBP', 'NGN'])
  assert.equal(getCurrency(), 'auto')
  for (const c of CURRENCIES) { assert.equal(setCurrency(c), c); assert.equal(getCurrency(), c); assert.equal(store.get('dibs.currency'), c) }
  store.set('dibs.currency', 'JPY')
  assert.equal(getCurrency(), 'auto')
  assert.equal(setCurrency('eur'), 'auto')
})

test('blocked storage: auto by default, a choice holds for the session, nothing throws', () => {
  blocked = true
  assert.equal(getCurrency(), 'auto')
  assert.equal(effectiveCurrency('CHF'), 'CHF')
  assert.equal(setCurrency('GBP'), 'GBP')
  assert.equal(getCurrency(), 'GBP')
  assert.equal(effectiveCurrency('CHF'), 'GBP')
})

test('effectiveCurrency: the choice, or in Auto the Nimiq Pay currency (else USD)', () => {
  assert.equal(effectiveCurrency('CHF'), 'CHF')
  assert.equal(effectiveCurrency('eur'), 'EUR')
  assert.equal(effectiveCurrency(undefined), 'USD')
  assert.equal(effectiveCurrency('EU&x=1'), 'USD')
  setCurrency('NGN')
  assert.equal(effectiveCurrency('CHF'), 'NGN')
  setCurrency('USD')
  assert.equal(effectiveCurrency('EUR'), 'USD')
})

test('regionForCurrency: USD USA, EUR Europe, GBP UK, NGN Nigeria; Auto and others null', () => {
  assert.equal(regionForCurrency('USD'), 'USA')
  assert.equal(regionForCurrency('EUR'), 'Europe')
  assert.equal(regionForCurrency('GBP'), 'UK')
  assert.equal(regionForCurrency('NGN'), 'Nigeria')
  assert.equal(regionForCurrency('auto'), null)
  assert.equal(regionForCurrency('CHF'), null)
  assert.equal(regionForCurrency(undefined), null)
})
