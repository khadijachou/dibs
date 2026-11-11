// Dibs server: catalogue with live Bitrefill prices, Lightning invoices, order status.
// It never holds or moves user funds: the user pays each invoice from their own wallet.
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { bitrefillEnabled, createLightningInvoice, getInvoice, getProduct } from './bitrefill.js'
import { adminStats, countCatalogFallback, forget, intake, publicStats, statsEnabled } from './stats.js'
import { adminPage, statsPage } from './pages.js'
import { createPriceBook, priceOf } from './prices.js'

// What Dibs sells: server/catalog.json, managed with `npm run catalog`.
// Read again whenever the file changes, so new items show after a page reload.
import { readFileSync, statSync } from 'node:fs'
const CATALOG_FILE = new URL('../catalog.json', import.meta.url)
let catalogCache = { mtime: 0, items: [] }
function catalog() {
  try {
    const mtime = statSync(CATALOG_FILE).mtimeMs
    if (mtime !== catalogCache.mtime) catalogCache = { mtime, items: JSON.parse(readFileSync(CATALOG_FILE, 'utf8')) }
  } catch (e) {
    console.error('catalog.json unreadable:', e.message)
  }
  return catalogCache.items.filter((i) => i.enabled !== false)
}

const app = new Hono()
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
if (origins.length) app.use('/api/*', cors({ origin: origins }))

// Rate limit: 10 writes per minute per IP.
const hits = new Map()
function limited(c) {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.env?.incoming?.socket?.remoteAddress || 'unknown'
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > 10
}

// Invoice access tokens stay on the server (anyone holding one can read the code).
// Persisted to data/invoices.json so a restart does not lose them. Not committed (data/ is git-ignored).
const DATA_FILE = new URL('../data/invoices.json', import.meta.url)
let invoices = {}
try { invoices = JSON.parse(await readFile(DATA_FILE, 'utf8')) } catch { invoices = {} }
async function saveInvoices() {
  await mkdir(new URL('../data/', import.meta.url), { recursive: true })
  await writeFile(DATA_FILE, JSON.stringify(invoices, null, 2))
}

// Live prices: one shop lookup per product, last good answer kept 24 h (src/prices.js). A background round refreshes
// every catalogue product after boot and every 4 minutes; the catalogue reads that cache and never waits on the shop
// (except once, on a cold cache at boot). Checkout still asks the shop again (fresh: true).
const prices = createPriceBook({ getProduct, enabled: bitrefillEnabled, log: (slug, e) => console.error('price lookup failed:', slug, e.message) })
const priceFor = async (item, opts) => priceOf(item, await prices.product(item.slug, opts))
prices.start(() => catalog().map((i) => i.slug))

app.get('/api/health', (c) => c.json({ ok: true, bitrefill: bitrefillEnabled() }))

// region (USA, Europe, UK, Nigeria), currency (the card's face currency) and worksWith ({ en, fr, es }: which
// accounts the card works with) come from catalog.json.
app.get('/api/catalog', async (c) => {
  const items = catalog()
  await prices.warm()
  const out = items.map((i) => {
    const p = priceOf(i, prices.cached(i.slug))
    return {
      id: i.id, name: i.name, detail: i.detail, icon: i.icon, faceValue: i.packageValue, usd: p.usd, live: p.live, sold: p.sold, inStock: p.inStock,
      region: i.region || 'USA', currency: i.currency || null, worksWith: i.worksWith || null, shopUrl: `https://www.bitrefill.com/${i.slug}/`,
    }
  })
  if (out.some((i) => !i.live)) countCatalogFallback() // admin view: daily count of answers with fallback prices
  return c.json(out)
})

// Creates the Lightning invoice for one item. Body: { itemId, email }.
app.post('/api/redeem', async (c) => {
  if (limited(c)) return c.json({ error: 'Too many requests' }, 429)
  if (!bitrefillEnabled()) return c.json({ error: 'API redeem is not configured; use the manual flow' }, 501)
  const { itemId, email } = await c.req.json().catch(() => ({}))
  const item = catalog().find((i) => i.id === itemId)
  if (!item) return c.json({ error: 'Unknown item' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))) return c.json({ error: 'A valid email is needed for the receipt' }, 400)
  try {
    const inv = await createLightningInvoice({ slug: item.slug, packageValue: item.packageValue, email, affiliateId: process.env.BITREFILL_AFFILIATE_ID || undefined })
    // orderToken: random per order, given to the app only. Needed to read the order (and its code) later.
    const orderToken = randomBytes(16).toString('hex')
    invoices[inv.invoiceId] = { token: inv.accessToken, orderToken, itemId, createdAt: new Date().toISOString() }
    await saveInvoices()
    // The amount paid is the shop's invoice (sats). The USD shown next to it is the shop's price asked again now,
    // never the catalogue's cache: null when the shop cannot be read, and the app then shows the invoice in USD.
    const p = await priceFor(item, { fresh: true })
    const fresh = p.live && p.pricedAt && Date.now() - Date.parse(p.pricedAt) < 60_000
    return c.json({ orderId: inv.invoiceId, orderToken, invoice: inv.invoice, sats: inv.sats, usd: fresh ? p.usd : null, expiresAt: inv.expiresAt })
  } catch (e) {
    console.error('redeem failed:', e.message)
    return c.json({ error: 'Could not create the order' }, 502)
  }
})

// True when the x-order-token header matches the order's token. Constant-time compare.
function tokenOk(rec, given) {
  if (!rec?.orderToken || typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(rec.orderToken)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Status of an invoice created here. The code is passed through once and never stored.
// Needs the order's x-order-token: missing, wrong or unknown id all get the same 404.
app.get('/api/orders/:id', async (c) => {
  const id = c.req.param('id')
  const rec = Object.hasOwn(invoices, id) ? invoices[id] : null
  if (!rec || !tokenOk(rec, c.req.header('x-order-token'))) return c.json({ error: 'Unknown order' }, 404)
  try {
    const { status, code, pin, link, raw } = await getInvoice(id, rec.token)
    // ?raw=1 shows Bitrefill's full answer, only when called from this PC (debugging the code field).
    const host = (c.req.header('host') || '').split(':')[0]
    if (c.req.query('raw') === '1' && (host === 'localhost' || host === '127.0.0.1')) return c.text(raw)
    return c.json({ status, code, pin, link })
  } catch (e) {
    console.error('order lookup failed:', e.message)
    return c.json({ error: 'Order lookup failed' }, 502)
  }
})

// ---- Anonymous usage stats (server/src/stats.js). Only phones whose user tapped Share stats send anything. ----

// Body: { anonId, events: [{ kind, at, data, backfill? }] }, at most 20 events and 8 KB.
async function smallJson(c) {
  const text = await c.req.text().catch(() => '')
  if (text.length > 8 * 1024) return null
  try { return JSON.parse(text) } catch { return null }
}
app.post('/api/events', async (c) => {
  if (!statsEnabled()) return c.body(null, 503)
  if (limited(c)) return c.body(null, 429)
  const body = await smallJson(c)
  if (!body) return c.body(null, 400)
  const r = await intake(body)
  if (r === 'bad') return c.body(null, 400)
  if (r === 'limited') return c.body(null, 429)
  return c.body(null, 204)
})

// Body: { anonId }. Removes every event of that device.
app.delete('/api/events', async (c) => {
  if (!statsEnabled()) return c.body(null, 503)
  if (limited(c)) return c.body(null, 429)
  const body = await smallJson(c)
  if (!body || !(await forget(body))) return c.body(null, 400)
  return c.body(null, 204)
})

app.get('/api/stats', async (c) => {
  c.header('cache-control', 'public, max-age=60')
  return c.json(await publicStats())
})

// Admin numbers: x-admin-key must match ADMIN_KEY. Missing key, wrong key or no ADMIN_KEY all get the same 404.
function adminOk(given) {
  const key = process.env.ADMIN_KEY || ''
  if (!key || typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(key)
  return a.length === b.length && timingSafeEqual(a, b)
}
app.get('/api/admin/stats', async (c) => {
  if (!adminOk(c.req.header('x-admin-key'))) return c.json({ error: 'Not found' }, 404)
  c.header('cache-control', 'no-store')
  return c.json(await adminStats())
})

app.get('/stats', (c) => c.html(statsPage))
app.get('/admin', (c) => { c.header('cache-control', 'no-store'); c.header('x-robots-tag', 'noindex'); return c.html(adminPage) })

const port = Number(process.env.PORT || 8787)
serve({ fetch: app.fetch, port }, () => console.log(`dibs server on http://localhost:${port} (bitrefill: ${bitrefillEnabled() ? 'on' : 'off'})`))
