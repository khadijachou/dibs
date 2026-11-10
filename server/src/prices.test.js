import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPriceBook, FRESH_MS, MAX_AGE_MS, priceOf } from './prices.js'

const STEAM = { slug: 'steam-usa', inStock: true, packages: [{ value: '5', price: 5.66 }, { value: '20', price: 23 }, { value: '50', price: 56.02 }] }
const item = (packageValue, fallbackUsd) => ({ slug: 'steam-usa', packageValue, fallbackUsd })
const clock = (t = Date.UTC(2026, 10, 10)) => { const c = { t, now: () => c.t }; return c }

test('one shop lookup per product, shared by all its items, even when asked at the same time', async () => {
  let calls = 0
  const book = createPriceBook({ getProduct: async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return STEAM } })
  const entries = await Promise.all(['5', '20', '50'].map(() => book.product('steam-usa')))
  assert.equal(calls, 1)
  assert.ok(entries.every((e) => e === entries[0]))
})

test('a burst of products is looked up at most 4 at a time', async () => {
  let running = 0, peak = 0
  const book = createPriceBook({ getProduct: async (slug) => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; return { ...STEAM, slug } } })
  await Promise.all(Array.from({ length: 22 }, (_, i) => book.product(`p${i}`)))
  assert.ok(peak <= 4, `peak ${peak}`)
})

test('the 10 Nov case: a failed lookup never makes one value of a product live and the others not', async () => {
  let fail = false
  const c = clock()
  const book = createPriceBook({ getProduct: async () => { if (fail) throw new Error('HTTP 429'); return STEAM }, now: c.now })
  const first = await book.product('steam-usa')
  c.t += FRESH_MS + 1
  fail = true
  const again = await book.product('steam-usa')
  assert.equal(again, first, 'last good answer kept')
  for (const v of ['5', '20', '50']) assert.equal(priceOf(item(v, 1), again).live, true, v)
})

test('the last good answer is used up to 24 h, never after: the price becomes an estimate (live:false)', async () => {
  let fail = false
  const c = clock()
  const book = createPriceBook({ getProduct: async () => { if (fail) throw new Error('down'); return STEAM }, now: c.now })
  await book.product('steam-usa')
  fail = true
  c.t += MAX_AGE_MS - 1
  assert.equal(priceOf(item('20', 22.48), await book.product('steam-usa')).live, true)
  c.t += 2
  const p = priceOf(item('20', 22.48), await book.product('steam-usa'))
  assert.deepEqual([p.live, p.usd, p.sold, p.inStock], [false, 22.48, null, true])
})

test('never read: estimate, not hidden; read and the value missing: sold:false', () => {
  assert.deepEqual(priceOf(item('20', 22.48), null), { usd: 22.48, live: false, sold: null, inStock: true, pricedAt: null })
  const riot = { product: { inStock: true, packages: [{ value: '25', price: 24.99 }] }, at: 0 }
  assert.equal(priceOf({ packageValue: '24.99', fallbackUsd: 24.99 }, riot).sold, false)
  assert.equal(priceOf({ packageValue: '25', fallbackUsd: 24.99 }, riot).sold, true)
})

test('fresh (checkout) asks the shop again even with a recent answer', async () => {
  let calls = 0
  const book = createPriceBook({ getProduct: async () => { calls++; return STEAM } })
  await book.product('steam-usa')
  await book.product('steam-usa')
  assert.equal(calls, 1)
  await book.product('steam-usa', { fresh: true })
  assert.equal(calls, 2)
})

test('shop not configured: the cache only, then estimates', async () => {
  const book = createPriceBook({ getProduct: async () => { throw new Error('never called') }, enabled: () => false })
  assert.equal(await book.product('steam-usa'), null)
})
