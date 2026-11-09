// Brand layer over the catalogue: the server lists one item per card value,
// the app shows one tile per brand and lets the user pick the value on the Plan screen.
// Brand is derived from the Bitrefill slug in shopUrl, so the server needs no change.
import { getCatalog } from './catalog.js'

// Order = order on the "All" view. The first eight sit above the fold.
// slugs marked "confirm" come from the shop site and must be checked on the server (`npm run catalog -- add <slug>`).
// Logos: lib/brandIcons.js (simple-icons, by key) first; else logo (app/public/logos/<key>.png);
// else tile (letter fallback in brand colours). The shop's catalogue data has no product image.
export const BRANDS = [
  { key: 'steam',       name: 'Steam',             chip: 'games',     logo: '/logos/steam.png',       slugs: ['steam-usa'] },
  { key: 'amazon',      name: 'Amazon',            chip: 'shopping',  logo: '/logos/amazon.png',      slugs: ['amazon_com-usa'], popular: true },
  { key: 'apple',       name: 'Apple',             chip: 'shopping',  logo: '/logos/apple.png',       slugs: ['apple-usa'] },
  { key: 'netflix',     name: 'Netflix',           chip: 'streaming', logo: '/logos/netflix.png',     slugs: ['netflix-usa', 'netflix-eu'] },
  { key: 'airbnb',      name: 'Airbnb',            chip: 'travel',    logo: '/logos/airbnb.png',      slugs: ['airbnb-usa'] },
  { key: 'googleplay',  name: 'Google Play',       chip: 'games',     logo: '/logos/googleplay.png',  slugs: ['google-play-usa'] },
  { key: 'playstation', name: 'PlayStation Store', chip: 'games',     logo: '/logos/playstation.png', slugs: ['sony-playstation-usa'] },
  { key: 'ubereats',    name: 'Uber Eats',         chip: 'food',      logo: '/logos/ubereats.png',    slugs: ['uber-eats-usa'] },
  // below the fold
  { key: 'nintendo',    name: 'Nintendo eShop',    chip: 'games',     logo: null, tile: { bg: '#e60012', fg: '#fff', letter: 'N' }, slugs: ['nintendo-eshop-usa'] },            // confirm
  { key: 'roblox',      name: 'Roblox',            chip: 'games',     logo: null, tile: { bg: '#1b1b1f', fg: '#fff', letter: 'R' }, slugs: ['roblox-usa'] },              // confirm
  { key: 'fortnite',    name: 'Fortnite',          chip: 'games',     logo: null, tile: { bg: '#1d3a6b', fg: '#fff', letter: 'F' }, slugs: ['fortnite-usa'] },            // confirm
  { key: 'valorant',    name: 'Valorant',          chip: 'games',     logo: null, tile: { bg: '#ff4655', fg: '#fff', letter: 'V' }, slugs: ['valorant-usa'] },            // confirm
  { key: 'riot',        name: 'Riot Access',       chip: 'games',     logo: null, tile: { bg: '#d13639', fg: '#fff', letter: 'R' }, slugs: ['riot-access-usa'] },         // confirm
  { key: 'xbox',        name: 'Xbox',              chip: 'games',     logo: null, tile: { bg: '#107c10', fg: '#fff', letter: 'X' }, slugs: ['xbox-usa'] },                // confirm, out of stock on 5 Nov
  { key: 'discord',     name: 'Discord Nitro',     chip: 'games',     logo: null, tile: { bg: '#5865f2', fg: '#fff', letter: 'D' }, slugs: ['discord-nitro-usa'] },       // confirm, maybe refused by the tool
  { key: 'hotels',      name: 'Hotels.com',        chip: 'travel',    logo: null, tile: { bg: '#d32f2f', fg: '#fff', letter: 'H' }, slugs: ['hotels_com-usa'] },          // confirm
  { key: 'flightgift',  name: 'Flightgift',        chip: 'travel',    logo: null, tile: { bg: '#1f6feb', fg: '#fff', letter: 'F' }, slugs: ['flightgift-usa'] },          // confirm
  { key: 'uber',        name: 'Uber',              chip: 'travel',    logo: null, tile: { bg: '#0b0b0d', fg: '#fff', letter: 'U' }, slugs: ['uber-usa'] },                // confirm
  { key: 'bestbuy',     name: 'Best Buy',          chip: 'shopping',  logo: null, tile: { bg: '#ffe000', fg: '#1b1b1f', letter: 'B' }, slugs: ['best-buy-usa'] },         // confirm
  { key: 'disney',      name: 'Disney',            chip: 'streaming', logo: null, tile: { bg: '#0a3e9a', fg: '#fff', letter: 'D' }, slugs: ['disney-usa'] },              // confirm
  { key: 'starbucks',   name: 'Starbucks',         chip: 'food',      logo: null, tile: { bg: '#00704a', fg: '#fff', letter: 'S' }, slugs: ['starbucks-usa'] },           // confirm
  { key: 'doordash',    name: 'DoorDash',          chip: 'food',      logo: null, tile: { bg: '#ff3008', fg: '#fff', letter: 'D' }, slugs: ['doordash-usa'] },            // confirm
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
