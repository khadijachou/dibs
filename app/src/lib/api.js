// Calls to our own server. The server holds the Bitrefill credentials and the invoice tokens.
import { config } from './config.js'

import { simulated } from './errors.js'

// Server error contract: { error, message } with error = an ErrorKey, or free text (old server).
const BY_STATUS = { 409: 'SHOP_OUT_OF_STOCK', 429: 'RATE_LIMIT', 501: 'NO_CREDENTIALS', 503: 'SHOP_LIMIT' }

async function call(path, opts = {}) {
  if (path === '/redeem') simulated('invoice')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  let r
  try {
    r = await fetch(`${config.apiUrl}/api${path}`, { headers: { 'content-type': 'application/json' }, signal: ctl.signal, ...opts })
  } catch (e) {
    const err = new Error(e.message); err.apiError = 'SRV_DOWN'; throw err
  } finally { clearTimeout(timer) }
  const body = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(body.message || body.error || `HTTP ${r.status}`)
    err.apiError = /^[A-Z_]+$/.test(body.error || '') ? body.error : BY_STATUS[r.status] || (r.status >= 500 ? 'SRV_DOWN' : 'GENERIC')
    throw err
  }
  return body
}

export const api = {
  health: () => call('/health'),
  catalog: () => call('/catalog'),
  // -> { orderId, invoice, sats, usd, expiresAt }
  createOrder: (itemId, email) => call('/redeem', { method: 'POST', body: JSON.stringify({ itemId, email }) }),
  // -> { status, code }
  order: (orderId) => call(`/orders/${encodeURIComponent(orderId)}`),
}
