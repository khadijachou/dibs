// Your accounts: the card version (USA, Europe, UK, Nigeria) that fits each of the user's accounts, per brand.
// localStorage dibs.prefs = { [brandKey]: versionKey }. Stays on this phone. Saved on its own when a goal is created
// or a goal's card changes (last one used wins), or by hand in More > Your accounts. Tapping a chip on the brand sheet
// only changes what is shown.
const KEY = 'dibs.prefs'
const OLD = 'dibs.region.' // 1.0.1: one key per brand, written by the brand sheet's chips

let migrated = false

// 1.0.1 -> 1.0.2: dibs.region.<brandKey> keys move into dibs.prefs (a pref already there wins), then go.
export function migratePrefs() {
  migrated = true
  let keys = []
  try { keys = Object.keys(localStorage).filter((k) => k.startsWith(OLD)) } catch { return }
  if (!keys.length) return
  const prefs = rawRead()
  for (const k of keys) {
    let v = null
    try { v = localStorage.getItem(k) } catch { /* storage blocked */ }
    const brandKey = k.slice(OLD.length)
    if (v && brandKey && !prefs[brandKey]) prefs[brandKey] = v
    try { localStorage.removeItem(k) } catch { /* storage blocked */ }
  }
  rawWrite(prefs)
}

function rawRead() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY))
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {}
  } catch { return {} }
}
function rawWrite(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* storage blocked */ }
  try { window.dispatchEvent(new Event('dibs:prefs')) } catch { /* no window under node --test */ }
}

export function readPrefs() {
  if (!migrated) migratePrefs()
  return rawRead()
}
export const getPref = (brandKey) => (brandKey ? readPrefs()[brandKey] || null : null)
export function setPref(brandKey, versionKey) {
  if (!brandKey || !versionKey) return
  const prefs = readPrefs()
  if (prefs[brandKey] === versionKey) return
  rawWrite({ ...prefs, [brandKey]: versionKey })
}
export function removePref(brandKey) {
  const prefs = readPrefs()
  if (!(brandKey in prefs)) return
  delete prefs[brandKey]
  rawWrite(prefs)
}
export const prefCount = () => Object.keys(readPrefs()).length

// Only brands sold in more than one version are remembered (one version: nothing to choose). brand: a catalogue brand
// (lib/brands.js catalogBrands) with its regions. Used when a goal is created and when Change card switches a card.
export const multiVersion = (brand) => (brand?.regions || []).length > 1
export function savePref(brand, versionKey) {
  if (multiVersion(brand)) setPref(brand.key, versionKey)
}

// 1.0.2: drops saved entries for brands the catalogue sells in one version only (saved by an earlier 1.0.2 build).
// brands: the live catalogue's brands. A brand missing from it is kept. Runs once (dibs.prefs.pruned).
const PRUNED = 'dibs.prefs.pruned'
export function prunePrefs(brands) {
  try { if (localStorage.getItem(PRUNED) === '1') return } catch { return }
  const prefs = readPrefs()
  const single = Object.keys(prefs).filter((k) => { const b = brands.find((x) => x.key === k); return b && !multiVersion(b) })
  if (single.length) { for (const k of single) delete prefs[k]; rawWrite(prefs) }
  try { localStorage.setItem(PRUNED, '1') } catch { /* storage blocked */ }
}

// Tests reset the one-time migration flag.
export const _resetPrefsForTest = () => { migrated = false }
