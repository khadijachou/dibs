// Live prices for NIM and BTC in USD. CoinGecko id for NIM is "nimiq-2" (to verify).
// Cached for 5 minutes; falls back to the .env rate for NIM if the request fails.
import { config } from './config.js'

let cache = null
const TTL = 5 * 60 * 1000

export async function getPrices() {
  if (cache && Date.now() - cache.at < TTL) return cache
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2,bitcoin&vs_currencies=usd')
    if (!r.ok) throw new Error('price http ' + r.status)
    const j = await r.json()
    cache = { nimUsd: j['nimiq-2']?.usd ?? config.fallbackNimUsd, btcUsd: j.bitcoin?.usd ?? null, live: true, at: Date.now() }
  } catch {
    cache = { nimUsd: config.fallbackNimUsd, btcUsd: null, live: false, at: Date.now() }
  }
  return cache
}

export const usdToNim = (usd, nimUsd) => Math.ceil(usd / nimUsd)
