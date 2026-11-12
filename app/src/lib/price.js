// Live prices for NIM and BTC in USD. CoinGecko id for NIM is "nimiq-2" (to verify).
// Cached for 5 minutes; falls back to the .env rate for NIM if the request fails.
// rates = CoinGecko's "nimiq-2" object (usd, eur, gbp, ngn and the Nimiq Pay currency, one request): only for the
// header balance value, which picks its rate at render time (components/ui.jsx, lib/currency.js effectiveCurrency),
// so a change of currency shows at once. No live rate for that currency = USD; no live rate at all = null.
// Every other number keeps using nimUsd.
import { config } from './config.js'
import { host } from './nimiq.js'
import { fiatCode } from './fiatValue.js'

let cache = null
const TTL = 5 * 60 * 1000
const VS = ['usd', 'eur', 'gbp', 'ngn']

export async function getPrices() {
  if (cache && Date.now() - cache.at < TTL) return cache
  const vs = [...new Set([...VS, fiatCode(host.fiat()).toLowerCase()])].join(',')
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2,bitcoin&vs_currencies=' + vs)
    if (!r.ok) throw new Error('price http ' + r.status)
    const j = await r.json()
    cache = { nimUsd: j['nimiq-2']?.usd ?? config.fallbackNimUsd, btcUsd: j.bitcoin?.usd ?? null, live: true, at: Date.now() }
    cache.rates = j['nimiq-2'] || null
  } catch {
    cache = { nimUsd: config.fallbackNimUsd, btcUsd: null, live: false, at: Date.now(), rates: null }
  }
  return cache
}

export const usdToNim = (usd, nimUsd) => Math.ceil(usd / nimUsd)
