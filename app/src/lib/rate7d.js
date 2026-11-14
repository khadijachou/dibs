// The NIM rate in USD 7 days ago (CoinGecko "nimiq-2" history), for the goal page's "Last 7 days" row. Display only.
// One request per calendar day at most: the answer, or null after a failure, is kept on the phone under
// dibs.rate7d = { day: 'YYYY-MM-DD' (local), nimUsd: number|null } and reused until the day changes.
// Never throws. Concurrent calls share one promise.
export const RATE7D_KEY = 'dibs.rate7d'
const URL_BASE = 'https://api.coingecko.com/api/v3/coins/nimiq-2/history'
const DAY_MS = 864e5

const pad = (n) => String(n).padStart(2, '0')

// Today on the phone, YYYY-MM-DD (local time): the cache's day.
export const localDay = (now = Date.now()) => {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// The history endpoint's date, DD-MM-YYYY, 7 days ago in UTC.
export const dateAgo7 = (now = Date.now()) => {
  const d = new Date(now - 7 * DAY_MS)
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`
}

export const rate7dUrl = (now = Date.now()) => `${URL_BASE}?date=${dateAgo7(now)}&localization=false`

// market_data.current_price.usd when it is a positive finite number, else null.
export const parseRate7d = (json) => {
  const v = json?.market_data?.current_price?.usd
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

const defaults = () => ({
  fetch: (...a) => globalThis.fetch(...a),
  storage: (() => { try { return globalThis.localStorage } catch { return null } })(),
  now: Date.now(),
})

let inflight = null // { day, storage, promise }

export function getRate7d(opts = {}) {
  const { fetch, storage, now } = { ...defaults(), ...opts }
  const day = localDay(now)
  let stored
  try {
    if (!storage) return Promise.resolve(null)
    stored = JSON.parse(storage.getItem(RATE7D_KEY) || 'null')
  } catch {
    return Promise.resolve(null) // blocked storage: nothing can be remembered, so nothing is asked
  }
  if (stored && stored.day === day) return Promise.resolve(typeof stored.nimUsd === 'number' && stored.nimUsd > 0 ? stored.nimUsd : null)
  if (inflight && inflight.day === day && inflight.storage === storage) return inflight.promise
  const promise = (async () => {
    let nimUsd = null
    try {
      const r = await fetch(rate7dUrl(now))
      if (r && r.ok) nimUsd = parseRate7d(await r.json())
    } catch { nimUsd = null }
    try { storage.setItem(RATE7D_KEY, JSON.stringify({ day, nimUsd })) } catch { nimUsd = null }
    return nimUsd
  })().finally(() => { if (inflight?.promise === promise) inflight = null })
  inflight = { day, storage, promise }
  return promise
}
