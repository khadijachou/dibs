// The live pool list (v1.5). One fetch of Nimiq's validators service per app session at most, and ONLY from the Add
// screen of a first deposit (lib/pools.js currentPool names the pool everywhere else without a call). A success is
// cached for the session; a failure is cached for 60 s so a screen cannot hammer the service. After a success a small
// copy without logos is saved to dibs.poolsSeen, so Savings can show a fee later without another call.
import { config } from './config.js'
import { pickable, sameAddress } from './pools.js'

const SEEN_KEY = 'dibs.poolsSeen'
const TIMEOUT_MS = 6000
const FAIL_TTL_MS = 60_000

let loaded = null // the successful pickable() result, kept for the session
let inflight = null // the shared in-flight promise, so two callers make one request
let failAt = 0 // when the last fetch failed; a failure is cached for FAIL_TTL_MS

const now = () => Date.now()

async function fetchPools() {
  const url = `${config.validatorsUrl}/api/v1/validators?payout-type=restake`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res
  try {
    res = await fetch(url, { signal: ctrl.signal, credentials: 'omit' }) // no credentials, no custom headers
  } finally {
    clearTimeout(timer)
  }
  if (!res || !res.ok) throw new Error(`validators service ${res ? res.status : 'no response'}`)
  const body = await res.json()
  const list = Array.isArray(body) ? body : (body && (body.validators || body.data)) || []
  const pools = pickable(list)
  saveSeen(pools)
  return pools
}

export async function loadPools() {
  if (loaded) return loaded
  if (inflight) return inflight
  if (failAt && now() - failAt < FAIL_TTL_MS) throw new Error('validators service recently unavailable')
  inflight = fetchPools().then(
    (pools) => { loaded = pools; inflight = null; return pools },
    (err) => { inflight = null; failAt = now(); throw err },
  )
  return inflight
}

// A small copy without logos, so Savings can show a fee later without a new call. Logos are never stored.
function saveSeen(pools) {
  try {
    const copy = pools.map((p) => ({ address: p.address, fee: p.fee, hours: p.hours }))
    window.localStorage.setItem(SEEN_KEY, JSON.stringify({ at: now(), pools: copy }))
  } catch { /* ignore */ }
}

export function seenPool(address) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SEEN_KEY))
    const pools = raw && Array.isArray(raw.pools) ? raw.pools : []
    return pools.find((p) => sameAddress(p.address, address)) || null
  } catch { return null }
}

// Tests only: clear the session cache so success, timeout and failure can be exercised in turn.
export function _resetPoolsCache() { loaded = null; inflight = null; failAt = 0 }
