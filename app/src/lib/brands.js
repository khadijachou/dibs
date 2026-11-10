// Brand layer over the catalogue: the server lists one item per card value,
// the app shows one tile per brand and lets the user pick the value on the Plan screen.
// Brand is derived from the Bitrefill slug in shopUrl, so the server needs no change.
import { getCatalog } from './catalog.js'
import { notSold } from './availability.js'

// popular: the "Popular" badge, a static flag (there is no pick count to rank by). Set on the first three of the
// curated order below.
// Order = order on the "All" view. The first eight sit above the fold.
// slugs marked "confirm" come from the shop site and must be checked on the server (`npm run catalog -- add <slug>`).
// Logos: lib/brandIcons.js (simple-icons, by key) first; else logo (only Amazon: app/public/logos/amazon.png);
// else tile: a letter tile in the brand's colour with a white letter. Used for Nintendo eShop, Xbox, Flightgift,
// Best Buy and Disney, which simple-icons does not carry; the shop's catalogue data has no product image.
export const BRANDS = [
  { key: 'steam',       name: 'Steam',             color: ['#2a475e', '#121a24'], chip: 'games',     logo: null,                     slugs: ['steam-usa'], popular: true, delivers: 'code', region: ['USA'], about: 'brand_about_steam' },
  { key: 'amazon',      name: 'Amazon',            color: ['#37475a', '#161c24'], chip: 'shopping',  logo: '/logos/amazon.png',      slugs: ['amazon_com-usa'], popular: true, delivers: 'code', region: ['USA'], about: 'brand_about_amazon' },
  { key: 'apple',       name: 'Apple',             color: ['#3a3a3c', '#0b0b0c'], chip: 'shopping',  logo: null,                     slugs: ['apple-usa'], popular: true, delivers: 'code', region: ['USA'], about: 'brand_about_apple' },
  { key: 'netflix',     name: 'Netflix',           color: ['#c40812', '#3b0306'], chip: 'streaming', logo: null,                     slugs: ['netflix-usa', 'netflix-eu'], delivers: 'code', region: ['USA', 'Europe'], about: 'brand_about_netflix' },
  { key: 'airbnb',      name: 'Airbnb',            color: ['#ff5a5f', '#7a1b2c'], chip: 'travel',    logo: null,                     slugs: ['airbnb-usa'], delivers: 'link', region: ['USA'], about: 'brand_about_airbnb' },
  { key: 'googleplay',  name: 'Google Play',       color: ['#0a8f66', '#0b2e24'], chip: 'games',     logo: null,                     slugs: ['google-play-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_googleplay' },
  { key: 'playstation', name: 'PlayStation Store', color: ['#0070d1', '#001a4d'], chip: 'games',     logo: null,                     slugs: ['sony-playstation-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_playstation' },
  { key: 'ubereats',    name: 'Uber Eats',         color: ['#06a85a', '#05331f'], chip: 'food',      logo: null,                     slugs: ['uber-eats-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_ubereats' },
  // below the fold
  { key: 'nintendo',    name: 'Nintendo eShop',    color: ['#e60012', '#5c0008'], chip: 'games',     logo: null, tile: { bg: '#E60012', fg: '#fff', letter: 'N' }, slugs: ['nintendo-eshop-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_nintendo' },            // confirm
  { key: 'roblox',      name: 'Roblox',            color: ['#4a4c51', '#131315'], chip: 'games',     logo: null, tile: { bg: '#1b1b1f', fg: '#fff', letter: 'R' }, slugs: ['roblox-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_roblox' },              // confirm
  { key: 'fortnite',    name: 'Fortnite',          color: ['#1d3a6b', '#0a1530'], chip: 'games',     logo: null, tile: { bg: '#1d3a6b', fg: '#fff', letter: 'F' }, slugs: ['fortnite-usa'] },            // confirm
  { key: 'valorant',    name: 'Valorant',          color: ['#ff4655', '#5c0f18'], chip: 'games',     logo: null, tile: { bg: '#ff4655', fg: '#fff', letter: 'V' }, slugs: ['valorant-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_valorant' },            // confirm
  { key: 'riot',        name: 'Riot Access',       color: ['#d13639', '#4a1012'], chip: 'games',     logo: null, tile: { bg: '#d13639', fg: '#fff', letter: 'R' }, slugs: ['riot-access-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_riot' },         // confirm
  { key: 'xbox',        name: 'Xbox',              color: ['#14931a', '#062e08'], chip: 'games',     logo: null, tile: { bg: '#107C10', fg: '#fff', letter: 'X' }, slugs: ['xbox-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_xbox' },                // confirm, out of stock on 5 Nov
  { key: 'discord',     name: 'Discord Nitro',     color: ['#5865f2', '#232782'], chip: 'games',     logo: null, tile: { bg: '#5865f2', fg: '#fff', letter: 'D' }, slugs: ['discord-nitro-usa'], delivers: 'link', region: ['USA'], about: 'brand_about_discord' },       // confirm, maybe refused by the tool
  { key: 'hotels',      name: 'Hotels.com',        color: ['#d32f2f', '#4f0f0f'], chip: 'travel',    logo: null, tile: { bg: '#d32f2f', fg: '#fff', letter: 'H' }, slugs: ['hotels_com-usa'], delivers: 'pin', region: ['USA'], about: 'brand_about_hotels' },          // confirm
  { key: 'flightgift',  name: 'Flightgift',        color: ['#1f6feb', '#0a2558'], chip: 'travel',    logo: null, tile: { bg: '#1F6FEB', fg: '#fff', letter: 'F' }, slugs: ['flightgift-usa'], delivers: 'link', region: ['USA'], about: 'brand_about_flightgift' },          // confirm
  { key: 'uber',        name: 'Uber',              color: ['#3a3a3e', '#050506'], chip: 'travel',    logo: null, tile: { bg: '#0b0b0d', fg: '#fff', letter: 'U' }, slugs: ['uber-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_uber' },                // confirm
  { key: 'bestbuy',     name: 'Best Buy',          color: ['#0046be', '#001a4a'], chip: 'shopping',  logo: null, tile: { bg: '#0046BE', fg: '#fff', letter: 'B' }, slugs: ['best-buy-usa'], delivers: 'pin', region: ['USA'], about: 'brand_about_bestbuy' },         // confirm
  { key: 'disney',      name: 'Disney',            color: ['#1b4fe0', '#08185c'], chip: 'streaming', logo: null, tile: { bg: '#113CCF', fg: '#fff', letter: 'D' }, slugs: ['disney-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_disney' },              // confirm
  { key: 'starbucks',   name: 'Starbucks',         color: ['#00845a', '#002e20'], chip: 'food',      logo: null, tile: { bg: '#00704a', fg: '#fff', letter: 'S' }, slugs: ['starbucks-usa'], delivers: 'pin', region: ['USA'], about: 'brand_about_starbucks' },           // confirm
  { key: 'doordash',    name: 'DoorDash',          color: ['#ff3008', '#6b1403'], chip: 'food',      logo: null, tile: { bg: '#ff3008', fg: '#fff', letter: 'D' }, slugs: ['doordash-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_doordash' },            // confirm
]

// About this card (Goal Details): about = i18n key of the one-line description; delivers = what the shop sends
// ('code' | 'pin' = card number + PIN | 'link'); region = where the card works. Airbnb, Discord, Flightgift and
// Disney: the shop's product data does not state the delivery form, so these follow the brand sheet (9 Nov).
export const CHIPS = ['games', 'travel', 'shopping', 'streaming', 'food']

const slugOf = (item) => (item.shopUrl || '').split('/').filter(Boolean).pop() || ''

export function brandOf(item) {
  if (!item) return null
  const slug = slugOf(item)
  return BRANDS.find((b) => b.slugs.includes(slug))
    || { key: slug || item.id, name: item.name.replace(/ gift card$/i, ''), chip: 'shopping', logo: null, slugs: [slug] }
}

// Gift card background (catalogue tiles, brand sheet): the brand's two colours, top left to bottom right.
const GRAD_FALLBACK = ['#3a3744', '#1b1a20']
export function brandGrad(key) {
  const [from, to] = BRANDS.find((x) => x.key === key)?.color || GRAD_FALLBACK
  return `linear-gradient(145deg, ${from} 0%, ${to} 100%)`
}

// Brands that have at least one item in the live catalogue, with their items sorted by value.
export function catalogBrands() {
  const map = new Map()
  const all = getCatalog()
  for (const item of all) {
    // Hidden: out of stock, or a value the shop does not sell (lib/availability.js notSold). Goals already on such a
    // card keep working; they get the "not available" choices instead.
    if (item.inStock === false || notSold(item, all)) continue
    const b = brandOf(item)
    if (!map.has(b.key)) map.set(b.key, { ...b, items: [] })
    map.get(b.key).items.push(item)
  }
  const order = (k) => { const i = BRANDS.findIndex((b) => b.key === k); return i < 0 ? 99 : i }
  return [...map.values()]
    .map((b) => {
      const items = b.items.slice().sort((x, y) => Number(x.faceValue || 0) - Number(y.faceValue || 0))
      // estimated: at least one value has no live shop quote (live: false), so its price is the catalogue's
      // stored placeholder (server fallbackUsd) and is only confirmed at checkout.
      // Price line: lib/itemName.js fromText() formats items[0] in the user's language.
      return { ...b, items, estimated: items.some((i) => i.live === false) }
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

// Where a brand's card works, in the user's language: "USA", "USA and Europe". Empty when unknown.
export function regionText(t, brand) {
  const regions = (brand?.region || []).map((r) => t(`region_${r}`))
  return regions.length > 1 ? t('region_join', { a: regions[0], b: regions[1] }) : regions[0] || ''
}
