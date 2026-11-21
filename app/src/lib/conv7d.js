// The NIM price over the last 7 days (CoinGecko "nimiq-2" market_chart), for the sparkline and "7 days: {x}%" on the
// Savings NIM converter. Display only. One request per currency per calendar day at most: the series, or null after a
// failure, is kept on the phone under dibs.conv7d = { day: 'YYYY-MM-DD' (local), series: { usd: [...], eur: [...] } }
// and reused until the day changes. Never throws. Concurrent calls for the same day and currency share one promise.
// Modelled on lib/rate7d.js (same cache-per-day, injectable fetch/storage/now for node --test).
export const CONV7D_KEY = 'dibs.conv7d'
const URL_BASE = 'https://api.coingecko.com/api/v3/coins/nimiq-2/market_chart'

const pad = (n) => String(n).padStart(2, '0')

// Today on the phone, YYYY-MM-DD (local time): the cache's day.
export const localDay = (now = Date.now()) => {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const marketChartUrl = (cur) => `${URL_BASE}?vs_currency=${encodeURIComponent(String(cur || 'usd').toLowerCase())}&days=7`

// The price points from market_chart ({ prices: [[ts, price], ...] }): positive finite numbers, downsampled to at most
// 24 points so the cache stays small, in order. null when there are fewer than two usable points.
export const parseSeries = (json) => {
  const arr = json?.prices
  if (!Array.isArray(arr)) return null
  const nums = arr.map((p) => (Array.isArray(p) ? Number(p[1]) : NaN)).filter((n) => Number.isFinite(n) && n > 0)
  if (nums.length < 2) return null
  return downsample(nums, 24)
}

// Keep at most `max` points, evenly spaced, always including the first and the last.
export function downsample(series, max = 24) {
  if (!Array.isArray(series) || series.length <= max) return Array.isArray(series) ? series.slice() : []
  const step = (series.length - 1) / (max - 1)
  const out = []
  for (let i = 0; i < max; i++) out.push(series[Math.round(i * step)])
  return out
}

// The 7-day change as a percentage (last versus first), or null when it cannot be read.
export const pct7d = (series) =>
  Array.isArray(series) && series.length >= 2 && series[0] > 0
    ? ((series[series.length - 1] - series[0]) / series[0]) * 100
    : null

// SVG polyline points for the sparkline, mapped into a w x h box (y inverted, a small top/bottom margin so flat lines
// still show). "" when there is nothing to draw.
export function sparkPoints(series, w = 100, h = 28, pad = 2) {
  if (!Array.isArray(series) || series.length < 2) return ''
  const lo = Math.min(...series)
  const hi = Math.max(...series)
  const span = hi - lo || 1
  const innerH = h - pad * 2
  return series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w
      const y = pad + innerH - ((v - lo) / span) * innerH
      return `${round(x)},${round(y)}`
    })
    .join(' ')
}

const round = (n) => Math.round(n * 100) / 100

const defaults = () => ({
  fetch: (...a) => globalThis.fetch(...a),
  storage: (() => { try { return globalThis.localStorage } catch { return null } })(),
  now: Date.now(),
})

let inflight = null // { day, cur, storage, promise }

// The last-7-days series for a currency (lower-cased), or null. Cached per day per currency; one request each.
export function getConv7d(cur, opts = {}) {
  const { fetch, storage, now } = { ...defaults(), ...opts }
  const code = String(cur || 'usd').toLowerCase()
  const day = localDay(now)
  let store
  try {
    if (!storage) return Promise.resolve(null)
    store = JSON.parse(storage.getItem(CONV7D_KEY) || 'null')
  } catch {
    return Promise.resolve(null) // blocked storage: nothing can be remembered, so nothing is asked
  }
  if (!store || store.day !== day || typeof store.series !== 'object' || !store.series) store = { day, series: {} }
  if (Object.prototype.hasOwnProperty.call(store.series, code)) {
    const s = store.series[code]
    return Promise.resolve(Array.isArray(s) && s.length >= 2 ? s : null)
  }
  if (inflight && inflight.day === day && inflight.cur === code && inflight.storage === storage) return inflight.promise
  const promise = (async () => {
    let series = null
    try {
      const r = await fetch(marketChartUrl(code))
      if (r && r.ok) series = parseSeries(await r.json())
    } catch { series = null }
    try {
      const fresh = JSON.parse(storage.getItem(CONV7D_KEY) || 'null')
      const base = fresh && fresh.day === day && fresh.series ? fresh : { day, series: {} }
      base.series[code] = series // a failure stores null, so it is not asked again today
      storage.setItem(CONV7D_KEY, JSON.stringify(base))
    } catch { /* storage blocked: the answer still stands for this session */ }
    return series
  })().finally(() => { if (inflight?.promise === promise) inflight = null })
  inflight = { day, cur: code, storage, promise }
  return promise
}
