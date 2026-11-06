// Brand layer over the catalogue: the server lists one item per card value,
// the app shows one tile per brand and lets the user pick the value on the Plan screen.
// Brand is derived from the Bitrefill slug in shopUrl, so the server needs no change.
import { getCatalog } from './catalog.js'

// Order = order on the "All" view. The first six sit above the fold.
export const BRANDS = [
  { key: 'steam', name: 'Steam', chip: 'games', logo: '/logos/steam.png', slugs: ['steam-usa'], popular: false },
  { key: 'amazon', name: 'Amazon', chip: 'shopping', logo: '/logos/amazon.png', slugs: ['amazon_com-usa'], popular: true },
  { key: 'apple', name: 'Apple', chip: 'shopping', logo: '/logos/apple.png', slugs: ['apple-usa'] },
  { key: 'netflix', name: 'Netflix', chip: 'streaming', logo: '/logos/netflix.png', slugs: ['netflix-usa', 'netflix-eu'] },
  { key: 'airbnb', name: 'Airbnb', chip: 'travel', logo: '/logos/airbnb.png', slugs: ['airbnb-usa'] },
  { key: 'googleplay', name: 'Google Play', chip: 'games', logo: '/logos/googleplay.png', slugs: ['google-play-usa'] },
  { key: 'playstation', name: 'PlayStation Store', chip: 'games', logo: '/logos/playstation.png', slugs: ['sony-playstation-usa'] },
  { key: 'ubereats', name: 'Uber Eats', chip: 'food', logo: '/logos/ubereats.png', slugs: ['uber-eats-usa'] },
]

export const CHIPS = ['games', 'travel', 'shopping', 'streaming', 'food']

const slugOf = (item) => (item.shopUrl || '').split('/').filter(Boolean).pop() || ''

export function brandOf(item) {
  if (!item) return null
  const slug = slugOf(item)
  return BRANDS.find((b) => b.slugs.includes(slug))
    || { key: slug || item.id, name: item.name.replace(/ gift card$/i, ''), chip: 'shopping', logo: null, slugs: [slug] }
}

// Currency of a card value, from the item detail ("50 USD", "25 EUR").
const currencyOf = (item) => (String(item.detail).match(/[A-Z]{3}/) || ['USD'])[0]

// Brands that have at least one item in the live catalogue, with their items sorted by value.
export function catalogBrands() {
  const map = new Map()
  for (const item of getCatalog()) {
    if (item.inStock === false) continue
    const b = brandOf(item)
    if (!map.has(b.key)) map.set(b.key, { ...b, items: [] })
    map.get(b.key).items.push(item)
  }
  const order = (k) => { const i = BRANDS.findIndex((b) => b.key === k); return i < 0 ? 99 : i }
  return [...map.values()]
    .map((b) => {
      const items = b.items.slice().sort((x, y) => Number(x.faceValue || 0) - Number(y.faceValue || 0))
      const min = items[0]
      return { ...b, items, from: `${min.faceValue || ''} ${currencyOf(min)}`.trim() }
    })
    .sort((a, b) => order(a.key) - order(b.key))
}

// Three amounts at most: smallest, a middle one, largest.
export function pickAmounts(items) {
  if (items.length <= 3) return items
  return [items[0], items[Math.floor(items.length / 2)], items[items.length - 1]]
}

export function brandLogo(item) {
  return brandOf(item)?.logo || null
}
