// Live prices for NIM and BTC in USD. CoinGecko id for NIM is "nimiq-2" (to verify).
// Cached for 5 minutes; falls back to the .env rate for NIM if the request fails.
// fiat = { code, rate }: the price of 1 NIM in the user's Nimiq Pay currency, only for the header
// balance value. Asked from CoinGecko whenever the currency is not USD; USD reuses nimUsd. No live
// rate for that currency = USD; no live rate at all = null. Every other number keeps using nimUsd.
import { config } from './config.js'
import { host } from './nimiq.js'
import { fiatCode, pickFiat } from './fiatValue.js'

let cache = null
const TTL = 5 * 60 * 1000

export async function getPrices() {
  if (cache && Date.now() - cache.at < TTL) return cache
  const code = fiatCode(host.fiat())
  try {
    const vs = code === 'USD' ? 'usd' : 'usd,' + code.toLowerCase()
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2,bitcoin&vs_currencies=' + vs)
    if (!r.ok) throw new Error('price http ' + r.status)
    const j = await r.json()
    cache = { nimUsd: j['nimiq-2']?.usd ?? config.fallbackNimUsd, btcUsd: j.bitcoin?.usd ?? null, live: true, at: Date.now() }
    cache.fiat = pickFiat(j['nimiq-2'], code)
  } catch {
    cache = { nimUsd: config.fallbackNimUsd, btcUsd: null, live: false, at: Date.now(), fiat: null }
  }
  return cache
}

export const usdToNim = (usd, nimUsd) => Math.ceil(usd / nimUsd)

