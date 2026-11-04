// Items users can call dibs on. The server is the source of truth (live Bitrefill prices);
// this static list is the fallback when the server is unreachable, and it must stay in sync
// with server/src/index.js. `usd` is what the user pays (Bitrefill payment price), not the face value.
import { api } from './api.js'

export const FALLBACK_CATALOG = [
  { id: 'steam-50', name: 'Steam gift card', detail: '50 USD', faceValue: '50', usd: 56.23, icon: 'game', shopUrl: 'https://www.bitrefill.com/steam-usa/', live: false, inStock: true },
  { id: 'steam-20', name: 'Steam gift card', detail: '20 USD', faceValue: '20', usd: 22.48, icon: 'game', shopUrl: 'https://www.bitrefill.com/steam-usa/', live: false, inStock: true },
  { id: 'steam-5', name: 'Steam gift card', detail: '5 USD', faceValue: '5', usd: 5.62, icon: 'game', shopUrl: 'https://www.bitrefill.com/steam-usa/', live: false, inStock: true },
]

let catalog = FALLBACK_CATALOG
let loaded = false

export async function loadCatalog() {
  if (loaded) return catalog
  try {
    const items = await api.catalog()
    if (Array.isArray(items) && items.length) catalog = items
  } catch { /* server down: keep the fallback */ }
  loaded = true
  return catalog
}

export const getCatalog = () => catalog
export const findItem = (id) => catalog.find((i) => i.id === id) || FALLBACK_CATALOG.find((i) => i.id === id)
