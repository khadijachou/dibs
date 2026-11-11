import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPriceBook, FRESH_MS, MAX_AGE_MS, REFRESH_MS, priceOf } from './prices.js'

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

// ---- Background refresh (11 Nov): the catalogue reads the cache, a round every 4 minutes fills it. ----
const fakeTimers = () => {
  const t = { handles: [], setInterval: (fn, ms) => { const h = { fn, ms, unref() { h.unrefd = true } }; t.handles.push(h); return h }, clearInterval: (h) => { t.handles = t.handles.filter((x) => x !== h) } }
  return t
}
const shop = (overrides = {}) => {
  const s = { calls: [], fail: null, delay: 0, getProduct: async (slug) => {
    s.calls.push(slug)
    if (s.delay) await new Promise((r) => setTimeout(r, s.delay))
    if (s.fail) throw new Error(s.fail)
    return { ...STEAM, slug }
  }, ...overrides }
  return s
}

test('a refresh round fills the cache, one lookup per product', async () => {
  const s = shop()
  const book = createPriceBook({ getProduct: s.getProduct, now: clock().now })
  await book.refresh(['steam-usa', 'netflix-eu', 'steam-usa'])
  assert.deepEqual(s.calls.sort(), ['netflix-eu', 'steam-usa'])
  assert.equal(book.cached('netflix-eu').product.slug, 'netflix-eu')
})

test('catalogue reads within 24 h never call the shop', async () => {
  const s = shop()
  const c = clock()
  const book = createPriceBook({ getProduct: s.getProduct, now: c.now })
  await book.refresh(['steam-usa'])
  const n = s.calls.length
  for (const dt of [1, FRESH_MS + 1, 12 * 3600_000, MAX_AGE_MS - 2]) {
    c.t = Date.UTC(2026, 10, 10) + dt
    assert.equal(priceOf(item('20', 1), book.cached('steam-usa')).live, true, `after ${dt} ms`)
  }
  assert.equal(s.calls.length, n)
  c.t = Date.UTC(2026, 10, 10) + MAX_AGE_MS + 1
  assert.equal(book.cached('steam-usa'), null, 'over 24 h: an estimate')
  assert.equal(s.calls.length, n)
})

test('a failing round (error or 429) keeps the last good answer and logs once', async () => {
  const s = shop()
  const logs = []
  const c = clock()
  const book = createPriceBook({ getProduct: s.getProduct, now: c.now, log: (k, e) => logs.push(e.message) })
  await book.refresh(['a', 'b', 'c', 'd', 'e', 'f'])
  const good = book.cached('a')
  c.t += REFRESH_MS
  s.fail = 'Bitrefill MCP HTTP 429: rate_limit_reached'
  s.calls = []
  await book.refresh(['a', 'b', 'c', 'd', 'e', 'f'])
  assert.equal(book.cached('a'), good)
  assert.equal(logs.length, 1)
  assert.ok(s.calls.length <= 4, `a 429 stops the round (${s.calls.length} calls)`)
  s.fail = 'socket hang up'
  await book.refresh(['a'])
  assert.equal(book.cached('a'), good)
  assert.equal(logs.length, 2)
})

test('two rounds never overlap', async () => {
  const s = shop({ delay: 5 })
  const book = createPriceBook({ getProduct: s.getProduct })
  const r1 = book.refresh(['a', 'b'])
  const r2 = book.refresh(['a', 'b'])
  assert.equal(r1, r2)
  await r1
  assert.equal(s.calls.length, 2)
})

test('start: a round at boot, then every 4 minutes on an unref\'d timer; warm waits for the boot round only', async () => {
  const s = shop({ delay: 5 })
  const timers = fakeTimers()
  const book = createPriceBook({ getProduct: s.getProduct, timers })
  book.start(() => ['steam-usa'])
  assert.equal(timers.handles.length, 1)
  assert.equal(timers.handles[0].ms, REFRESH_MS)
  assert.ok(REFRESH_MS < FRESH_MS)
  assert.equal(timers.handles[0].unrefd, true)
  assert.equal(book.cached('steam-usa'), null)
  await book.warm()
  assert.ok(book.cached('steam-usa'))
  timers.handles[0].fn()
  await book.refresh([])
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(s.calls.length, 2)
  book.stop()
  assert.equal(timers.handles.length, 0)
})

test('nothing runs when the shop is not configured', async () => {
  const s = shop()
  const timers = fakeTimers()
  const book = createPriceBook({ getProduct: s.getProduct, enabled: () => false, timers })
  book.start(() => ['steam-usa'])
  await book.refresh(['steam-usa'])
  await book.warm()
  assert.equal(timers.handles.length, 0)
  assert.equal(s.calls.length, 0)
})
