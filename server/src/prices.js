// Shop prices for the catalogue: one lookup per product (never one per item), a few at a time, and the last good
// answer kept for up to 24 h when the shop cannot be read.
//
// 10 Nov: /api/catalog looked up every item at once (54 calls, three for steam-usa). When some of them failed, a
// product came back with one value live and the others live: false, and the app hid those as "not sold" (Steam
// showed 5 USD only). Now every item of a product shares one answer, and "the shop does not sell this value"
// (sold: false) is only said when the shop's list was actually read.

// 11 Nov: the catalogue grew to 43 products (versions USA, Europe, UK). /api/catalog no longer asks the shop: a
// background round refreshes every product every 4 minutes (under FRESH_MS) and the catalogue reads the cache only.
// It waits for the shop once, on a cold cache at boot.

export const FRESH_MS = 5 * 60_000 // a shop answer younger than this is used without asking again
export const MAX_AGE_MS = 24 * 3600_000 // the last good answer is used up to this age when the shop cannot be read
export const REFRESH_MS = 4 * 60_000 // background round: every product, under FRESH_MS so the cache stays fresh
const CONCURRENCY = 4

// getProduct(slug) -> { inStock, packages: [{ value, price }] }; log(slug, err) on a failed lookup.
// timers: injected in tests (fake clock); setInterval's handle is unref'd so it never keeps the process alive.
export function createPriceBook({ getProduct, enabled = () => true, now = () => Date.now(), log = () => {}, timers = globalThis }) {
  const cache = new Map() // slug -> { product, at }
  const inflight = new Map() // slug -> Promise<{ product, at }>
  let running = 0
  const queue = []
  const slot = () => (running < CONCURRENCY ? Promise.resolve(running++) : new Promise((r) => queue.push(r)).then(() => running++))
  const release = () => { running--; queue.shift()?.() }

  const lookup = (slug) => {
    if (!inflight.has(slug)) {
      const p = slot()
        .then(() => getProduct(slug))
        .then((product) => { const entry = { product, at: now() }; cache.set(slug, entry); return entry })
        .finally(() => { release(); inflight.delete(slug) })
      inflight.set(slug, p)
    }
    return inflight.get(slug)
  }

  // The shop's answer for this product: { product, at } or null (never read, or the last answer is over 24 h old).
  // fresh: ask the shop even when the cache is recent (checkout); still falls back to a recent answer on failure.
  async function product(slug, { fresh = false } = {}) {
    const hit = cache.get(slug)
    if (!fresh && hit && now() - hit.at < FRESH_MS) return hit
    if (enabled()) {
      try { return await lookup(slug) } catch (e) { log(slug, e) }
    }
    return hit && now() - hit.at < MAX_AGE_MS ? hit : null
  }

  // The cache only, never the shop: the last good answer up to 24 h old, else null (an estimate).
  const cached = (slug) => {
    const hit = cache.get(slug)
    return hit && now() - hit.at < MAX_AGE_MS ? hit : null
  }

  // One background round: every product once, through the same lookup (4 at a time, shared with checkout).
  // Never two rounds at once: a call during a round gets that round. A failure keeps the last good answer; a 429
  // stops the round (no more calls until the next one). One log line per round.
  let round = null
  function refresh(slugs) {
    if (!enabled()) return Promise.resolve()
    if (round) return round
    // Stalest first: never fetched, then the oldest answer (12 Nov: a 429 stopped every round at the same place, so
    // the products at the end of the catalogue were rarely refreshed). A stopped round resumes there next time,
    // with no cursor to store. Ties keep the catalogue order (stable sort).
    const age = (slug) => cache.get(slug)?.at ?? -Infinity
    const list = [...new Set(slugs)].sort((a, b) => age(a) - age(b))
    let next = 0
    let failed = 0
    let first = null
    let stopped = false
    const worker = async () => {
      while (!stopped && next < list.length) {
        const slug = list[next++]
        try { await lookup(slug) } catch (e) {
          failed++
          first ??= e
          if (/\b429\b|rate.?limit/i.test(e?.message || '')) stopped = true
        }
      }
    }
    round = Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker))
      .then(() => { if (failed) log('refresh', new Error(`${failed} of ${list.length} product(s) not refreshed${stopped ? ' (rate limited, round stopped)' : ''}: ${first?.message || first}`)) })
      .finally(() => { round = null })
    return round
  }

  // After boot and then every REFRESH_MS. Nothing when the shop is not configured.
  let boot = null
  let timer = null
  function start(slugs) {
    if (!enabled() || timer) return
    boot = refresh(slugs())
    timer = timers.setInterval(() => { refresh(slugs()) }, REFRESH_MS)
    timer?.unref?.()
  }
  const stop = () => { if (timer) timers.clearInterval(timer); timer = null }
  // Resolves at once, except while the first round runs on a cold cache (the catalogue waits for it, once).
  const warm = () => boot || Promise.resolve()

  return { product, cached, refresh, start, stop, warm }
}

// One catalogue item's price from its product's answer.
//   live: true   the shop's price, read within the last 24 h
//   live: false  no usable answer: the price is an estimate (≈, "Price confirmed at checkout")
//   sold: false  the shop's list was read and does not have this value (the app hides it)
//   sold: null   unknown (no answer): never hidden for that reason
export function priceOf(item, entry) {
  if (!entry) return { usd: item.fallbackUsd, live: false, sold: null, inStock: true, pricedAt: null }
  const { product, at } = entry
  const pkg = product.packages.find((p) => p.value === item.packageValue)
  if (!pkg) return { usd: item.fallbackUsd, live: false, sold: false, inStock: product.inStock, pricedAt: null }
  return { usd: pkg.price, live: true, sold: true, inStock: product.inStock, pricedAt: new Date(at).toISOString() }
}
