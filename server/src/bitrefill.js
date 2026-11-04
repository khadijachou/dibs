// Bitrefill adapter on top of the MCP tools (verified against real responses on 2026-10-28).
//
// get-product-details answers in a compact text format, buy-products answers in JSON text.
// Only the fields Dibs needs are parsed; everything else is ignored.
import { callTool, mcpEnabled } from './mcp.js'

export const bitrefillEnabled = mcpEnabled

// Returns { slug, name, inStock, recipientType, packages: [{ value, currency, price, priceCurrency }] }
export async function getProduct(slug) {
  const text = await callTool('get-product-details', { product_id: slug, currency: 'USD' })
  const get = (key) => {
    const m = new RegExp(`^${key}: (.*)$`, 'm').exec(text)
    return m ? m[1].trim().replace(/^"|"$/g, '') : null
  }
  const packages = []
  const block = /^packages\[\d+\]\{([^}]*)\}:\n((?:[ \t]+.*\n?)+)/m.exec(text)
  if (block) {
    const cols = block[1].split(',')
    for (const line of block[2].split('\n')) {
      if (!line.trim()) continue
      const cells = splitCsv(line.trim())
      const row = Object.fromEntries(cols.map((c, i) => [c, cells[i]]))
      packages.push({
        value: row.package_value,
        currency: row.package_currency,
        price: Number(row.payment_price),
        priceCurrency: row.payment_currency,
      })
    }
  }
  const methods = /^\s*address_based\[\d+\]: (.*)$/m.exec(text)?.[1]?.split(',').map((x) => x.trim()) || []
  const categories = /^categories\[\d+\]: (.*)$/m.exec(text)?.[1]?.split(',').map((x) => x.trim()) || []
  return {
    slug,
    name: get('name'),
    country: get('country_code'),
    currency: get('currency'),
    inStock: get('in_stock') === 'true',
    recipientType: get('recipient_type') || 'none',
    lightning: methods.includes('lightning'),
    categories,
    packages,
  }
}

// Search the Bitrefill catalogue. Returns [{ slug, name, country, currency, inStock, type, categories }].
export async function searchProducts({ query, country = 'US', productType, perPage = 25 }) {
  const args = { query, intent: 'Dibs catalogue: items people save up for', country, per_page: perPage }
  if (productType) args.product_type = productType
  const text = await callTool('search-products', args)
  const start = text.search(/^products\[\d+\]:/m)
  if (start < 0) return []
  const block = text.slice(start).split('\n').slice(1)
  const out = []
  let cur = null
  for (const line of block) {
    if (/^\S/.test(line)) break // next top-level key (found:, page:)
    const m = /^\s*(- )?([a-zA-Z_]+)(\[\d+\])?: ?(.*)$/.exec(line)
    if (!m) continue
    if (m[1]) { cur = {}; out.push(cur) }
    if (cur) cur[m[2]] = m[4].replace(/^"|"$/g, '').trim()
  }
  return out.map((p) => ({
    slug: p.slug || p._id,
    name: p.name,
    country: p.countries || '',
    currency: p.currency,
    inStock: p.in_stock === 'true',
    type: p.type,
    categories: (p.categories || '').split(',').filter(Boolean),
  }))
}

// Creates an unpaid Lightning invoice. Returns { invoiceId, accessToken, invoice, sats, expiresAt }.
export async function createLightningInvoice({ slug, packageValue, email, refillInput, affiliateId }) {
  const item = { product_id: slug, package_value: String(packageValue) }
  if (refillInput) item.refill_input = refillInput
  const args = { cart_items: [item], payment_method: 'lightning', return_payment_link: false, email }
  if (affiliateId) args.affiliate_id = affiliateId
  const text = await callTool('buy-products', args)
  const j = JSON.parse(text)
  const res = j.response || j
  const invoice = res.payment_info?.lightningInvoice
  if (!invoice) throw new Error('Bitrefill invoice has no Lightning payment request')
  const minutes = Number(res.expiration_minutes) || 30
  return {
    invoiceId: res.invoice_id,
    accessToken: res.invoice_access_token,
    invoice,
    sats: Number(res.payment_info.satoshiPrice) || null,
    expiresAt: new Date(Date.parse(res.created_time || Date.now()) + minutes * 60_000).toISOString(),
  }
}

// Returns { status, code, raw }. Status is Bitrefill's invoice status
// (created, payment_detected, payment_confirmed, complete, blocked).
// The code can sit in several places depending on the product, so we search for it.
const CODE_KEYS = ['code', 'pin', 'claim_code', 'redemption_code', 'voucher', 'link', 'url']

function findCode(node, inRedemption = false) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) { const c = findCode(n, inRedemption); if (c) return c }
    return null
  }
  for (const [k, v] of Object.entries(node)) {
    const key = k.toLowerCase()
    // eSIMs deliver an install link instead of a code.
    if (key.includes('esim') && key.includes('link') && typeof v === 'string' && v.trim()) return v.trim()
    if (key.includes('redemption') && v && typeof v === 'object') {
      const c = findCode(v, true); if (c) return c
    }
    if (inRedemption && CODE_KEYS.includes(key) && typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') { const c = findCode(v, inRedemption); if (c) return c }
  }
  return null
}

export async function getInvoice(invoiceId, accessToken) {
  const text = await callTool('get-invoice-by-id', { invoice_id: invoiceId, invoice_access_token: accessToken })
  let data = null
  try { data = JSON.parse(text) } catch { /* compact text */ }
  const res = data?.response || data
  if (res && typeof res === 'object') {
    return { status: res.status || 'unknown', code: findCode(res), raw: text }
  }
  // Compact text format: take the lines after the first "redemption" key.
  const status = /^\s*status: (.+)$/m.exec(text)?.[1]?.trim().replace(/^"|"$/g, '') || 'unknown'
  let code = null
  const idx = text.search(/redemption/i)
  if (idx >= 0) {
    const tail = text.slice(idx)
    const m = /^\s*(code|pin|claim_code|redemption_code|voucher|link|url): "?([^"\n]+)"?/m.exec(tail)
    if (m) code = m[2].trim()
  }
  return { status, code, raw: text }
}

function splitCsv(line) {
  const out = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') { q = !q; continue }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}
