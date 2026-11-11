// Items users can call dibs on. The server is the source of truth (live Bitrefill prices);
// this static list is the fallback when the server is unreachable, and it must stay in sync
// with server/src/index.js. `usd` is what the user pays (Bitrefill payment price), not the face value.
import { api } from './api.js'

// Steam USA's works-with line, as in server/catalog.json (built from the shop's note "Make sure your Steam account is
// set to USD currency").
const STEAM_USA = {
  region: 'USA',
  currency: 'USD',
  worksWith: { en: 'For Steam accounts with a USD wallet', fr: 'Pour les comptes Steam avec un portefeuille en USD', es: 'Para cuentas de Steam con billetera en USD' },
}

export const FALLBACK_CATALOG = [
  { id: 'steam-50', name: 'Steam gift card', detail: '50 USD', faceValue: '50', usd: 56.23, icon: 'game', shopUrl: 'https://www.bitrefill.com/steam-usa/', live: false, inStock: true, ...STEAM_USA },
  { id: 'steam-20', name: 'Steam gift card', detail: '20 USD', faceValue: '20', usd: 22.48, icon: 'game', shopUrl: 'https://www.bitrefill.com/steam-usa/', live: false, inStock: true, ...STEAM_USA },
  { id: 'steam-5', name: 'Steam gift card', detail: '5 USD', faceValue: '5', usd: 5.62, icon: 'game', shopUrl: 'https://www.bitrefill.com/steam-usa/', live: false, inStock: true, ...STEAM_USA },
]

let catalog = FALLBACK_CATALOG
let loaded = false
let fromServer = false

export async function loadCatalog() {
  if (loaded) return catalog
  try {
    const items = await api.catalog()
    if (Array.isArray(items) && items.length) { catalog = items; fromServer = true }
  } catch { /* server down: keep the fallback (or the last good list) */ }
  loaded = true
  return catalog
}

// Reads the catalogue again (checkout: was the card withdrawn or sold out since launch?).
export async function refreshCatalog() {
  loaded = false
  return loadCatalog()
}

// True once the list comes from the server. The fallback list holds three Steam values only, so card availability
// is never judged from it (lib/availability.js).
export const catalogFromServer = () => fromServer

export const getCatalog = () => catalog
export const findItem = (id) => catalog.find((i) => i.id === id) || FALLBACK_CATALOG.find((i) => i.id === id)
