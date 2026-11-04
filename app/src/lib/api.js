// Calls to our own server. The server holds the Bitrefill credentials and the invoice tokens.
import { config } from './config.js'

async function call(path, opts = {}) {
  const r = await fetch(`${config.apiUrl}/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`)
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
