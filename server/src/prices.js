// Shop prices for the catalogue: one lookup per product (never one per item), a few at a time, and the last good
// answer kept for up to 24 h when the shop cannot be read.
//
// 10 Nov: /api/catalog looked up every item at once (54 calls, three for steam-usa). When some of them failed, a
// product came back with one value live and the others live: false, and the app hid those as "not sold" (Steam
// showed 5 USD only). Now every item of a product shares one answer, and "the shop does not sell this value"
// (sold: false) is only said when the shop's list was actually read.

export const FRESH_MS = 5 * 60_000 // a shop answer younger than this is used without asking again
export const MAX_AGE_MS = 24 * 3600_000 // the last good answer is used up to this age when the shop cannot be read
const CONCURRENCY = 4

// getProduct(slug) -> { inStock, packages: [{ value, price }] }; log(slug, err) on a failed lookup.
export function createPriceBook({ getProduct, enabled = () => true, now = () => Date.now(), log = () => {} }) {
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

  return { product }
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
