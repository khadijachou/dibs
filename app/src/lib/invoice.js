// Reads the amount from a BOLT11 invoice's human-readable part (lnbc2500u1...).
// Used to check an invoice against the item price before paying.
// Returns { network, sats } or null when the string is not a BOLT11 invoice with an amount.
const MULT = { m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12 }

export function parseInvoice(raw) {
  const inv = String(raw || '').trim().toLowerCase().replace(/^lightning:/, '')
  const m = /^ln(bcrt|bc|tbs|tb)(\d+)([munp])?1[02-9ac-hj-np-z]+$/.exec(inv)
  if (!m) return null
  const [, net, digits, unit] = m
  const btc = Number(digits) * (unit ? MULT[unit] : 1)
  if (!Number.isFinite(btc) || btc <= 0) return null
  return {
    network: net === 'bc' ? 'mainnet' : 'testnet',
    sats: Math.round(btc * 1e8),
  }
}

// True when the invoice is within `tolerance` (default 10%) of the expected USD price.
export function invoiceMatchesPrice({ sats, btcUsd, expectedUsd, tolerance = 0.1 }) {
  if (!sats || !btcUsd || !expectedUsd) return { ok: false, invoiceUsd: null }
  const invoiceUsd = (sats / 1e8) * btcUsd
  return { ok: Math.abs(invoiceUsd - expectedUsd) <= expectedUsd * tolerance, invoiceUsd }
}
