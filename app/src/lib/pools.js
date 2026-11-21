// The staking pools Dibs has checked (v1.5). Pure: no storage writes but through the small helpers below, no network,
// no React, no Date. lib/poolsApi.js fetches the live list and validates it through pickable() here; the Add screen of
// a first deposit shows the result; screens name the user's pool through pace.js poolName() over currentPool().
//
// Fees are NOT baked in: a fee is shown only from the live list (lib/poolsApi.js) or the last list this phone saw
// (dibs.poolsSeen). What is baked is the fixed order, the name to show when the service is down, and the payout hours.

// Section A, in this fixed order. Garuda Pool is the default: a user who never taps "Change" stakes exactly as before.
export const CHECKED = [
  { address: 'NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7', name: 'Garuda Pool', hours: 12 },
  { address: 'NQ53 M1NT S3JD TAGM CBTK 01PX YD3U B1DE GYHB', name: 'Mint Pool', hours: 3 },
  { address: 'NQ38 VK34 DRBL S3CN M9KM 8UJN 9JY2 2KFN VQQH', name: 'Siam Pool', hours: 3 },
  { address: 'NQ44 V95C ABVY RARR SBMC V8VE M6UH EJP0 RXYQ', name: 'nim.re Staking Pool', hours: 12 },
  { address: 'NQ08 LMAK 00XK YYN9 CDXV ADVG CL0U HUBM J670', name: 'Ritvars Staking', hours: 12 },
]
export const DEFAULT_POOL = CHECKED[0].address // Garuda

const norm = (a) => String(a == null ? '' : a).replace(/\s+/g, '').toUpperCase()
export const sameAddress = (a, b) => { const x = norm(a); return x !== '' && x === norm(b) }
export const isChecked = (address) => CHECKED.some((p) => sameAddress(p.address, address))
export const checkedPool = (address) => CHECKED.find((p) => sameAddress(p.address, address)) || null

// A syntactically valid Nimiq user-friendly address: NQ + 2 check digits + 32 base32 characters, 36 in all once spaces
// are removed. Rejects the demo validator placeholder ('NQ00 DEMO VALIDATOR'), so it is never stored as a known pool.
const ADDRESS_RE = /^NQ[0-9A-Z]{34}$/
export const validAddress = (a) => ADDRESS_RE.test(norm(a))

// A logo is drawn only when it is a base64 data URL of an allowed image type, under 60,000 characters. Anything else
// (a URL, an SVG that is not base64, something too big) gives null, and the picker falls back to a plain initial tile.
const LOGO_RE = /^data:image\/(svg\+xml|png|webp|jpeg);base64,/
export const validLogo = (logo) => typeof logo === 'string' && logo.length < 60000 && LOGO_RE.test(logo)

// "Every 3 hours" -> 3; null when the schedule does not carry a number of hours.
const parseHours = (schedule) => { const m = /(\d+)\s*hours?/i.exec(String(schedule || '')); return m ? Number(m[1]) : null }

// pickable(liveList): from the service's array, the entries that are one of the five, listed, restaking, with a sane fee
// and current data. Returned in the fixed order as { address, name, fee, hours, logo }. The default pool is ALWAYS in
// the result: if the service drops it or marks it otherwise, it is added from the baked data with fee null.
export function pickable(liveList) {
  const list = Array.isArray(liveList) ? liveList : []
  const byAddr = new Map()
  for (const e of list) {
    if (!e || typeof e !== 'object') continue
    const baked = checkedPool(e.address || e.validatorAddress || e.account)
    if (!baked) continue // an address outside the five
    if (e.isListed !== true) continue
    if (e.payoutType !== 'restake') continue
    if (typeof e.fee !== 'number' || !(e.fee >= 0 && e.fee <= 0.5)) continue
    if (!e.score || e.score.dataStatus !== 'current') continue
    const name = (typeof e.name === 'string' ? e.name.trim().slice(0, 40) : '') || baked.name
    byAddr.set(norm(baked.address), {
      address: baked.address,
      name,
      fee: e.fee,
      hours: parseHours(e.payoutSchedule),
      logo: validLogo(e.logo) ? e.logo : null,
    })
  }
  if (!byAddr.has(norm(DEFAULT_POOL))) {
    const d = checkedPool(DEFAULT_POOL)
    byAddr.set(norm(DEFAULT_POOL), { address: d.address, name: d.name, fee: null, hours: d.hours, logo: null })
  }
  return CHECKED.filter((p) => byAddr.has(norm(p.address))).map((p) => byAddr.get(norm(p.address)))
}

// "5%", "3.33%", in the language's number format (fr "3,33 %" with a no-break space before the sign); nothing for null.
export function feeText(fee, lang = 'en') {
  if (typeof fee !== 'number' || !Number.isFinite(fee)) return ''
  const locale = lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US'
  const n = (fee * 100).toLocaleString(locale, { maximumFractionDigits: 2 })
  return lang === 'fr' ? `${n} %` : `${n}%`
}

// --- The stored choice and the known pool (the only impure part: localStorage, guarded). ---
const CHOICE_KEY = 'dibs.poolChoice' // the address picked before the first deposit
const POOL_KEY = 'dibs.pool' // the delegation last read from the user's staker
const store = () => { try { return window.localStorage } catch { return null } }
const read = (k) => { try { return store()?.getItem(k) } catch { return null } }
const write = (k, v) => { try { store()?.setItem(k, v) } catch { /* ignore */ } }

// The stored choice, re-validated: a checked address, or the default. The stored value is untrusted input.
export function getChoice() {
  const v = read(CHOICE_KEY)
  return isChecked(v) ? checkedPool(v).address : DEFAULT_POOL
}
// setChoice refuses anything that is not one of the five.
export function setChoice(address) {
  if (!isChecked(address)) return false
  write(CHOICE_KEY, checkedPool(address).address)
  return true
}

// rememberPool: the delegation read from the user's staker. Accepts any syntactically valid Nimiq address, since a user
// may stake elsewhere outside Dibs. Called where the app already reads the staker (Goal and Savings).
export function rememberPool(address) {
  if (validAddress(address)) write(POOL_KEY, String(address).trim())
}
export const knownPool = () => read(POOL_KEY) || null

// The user's pool: the delegation read from their staker, else the choice made before a first deposit, else the default.
export const currentPool = () => knownPool() || getChoice()
