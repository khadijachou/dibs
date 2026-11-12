// Brand layer over the catalogue: the server lists one item per card value,
// the app shows one tile per brand and lets the user pick the value on the Plan screen.
// Brand is derived from the Bitrefill slug in shopUrl, so the server needs no change.
import { getCatalog } from './catalog.js'
import { notSold } from './availability.js'
import { getPref } from './prefs.js'
import { getCurrency, regionForCurrency } from './currency.js'

// popular: the "Popular" badge, a static flag (there is no pick count to rank by). Set on the first three of the
// curated order below.
// Order = order on the "All" view. The first eight sit above the fold.
// slugs marked "confirm" come from the shop site and must be checked on the server (`npm run catalog -- add <slug>`).
// Logos: lib/brandIcons.js (simple-icons, by key) first; else logo, a file in app/public/logos (Amazon, Nintendo eShop,
// Xbox, Flightgift, Best Buy, Disney, Bolt: brands simple-icons does not carry; the shop's catalogue data has no product
// image); else tile: a letter tile in the brand's colour with a white letter. tile and color still tint the cards.
// logoPlate (logo files only): absent = white plate, logo contained at 84 % (Amazon); '#rrggbb' = that plate colour
// (a light logo on a transparent background, or a wide logo with its own solid background: plate and picture blend);
// 'fill' = the picture fills the tile, no plate, no padding (a square picture with its own background).
export const BRANDS = [
  { key: 'steam',       name: 'Steam',             color: ['#2a475e', '#121a24'], chip: 'games',     logo: null,                     slugs: ['steam-usa', 'steam-eur-international'], popular: true, delivers: 'code', region: ['USA', 'Europe'], about: 'brand_about_steam' },
  { key: 'amazon',      name: 'Amazon',            color: ['#37475a', '#161c24'], chip: 'shopping',  logo: '/logos/amazon.png',      slugs: ['amazon_com-usa', 'amazon-uk'], popular: true, delivers: 'code', region: ['USA', 'UK'], about: 'brand_about_amazon' },
  { key: 'apple',       name: 'Apple',             color: ['#3a3a3c', '#0b0b0c'], chip: 'shopping',  logo: null,                     slugs: ['apple-usa', 'apple-united-kingdom'], popular: true, delivers: 'code', region: ['USA', 'UK'], about: 'brand_about_apple' },
  { key: 'netflix',     name: 'Netflix',           color: ['#c40812', '#3b0306'], chip: 'streaming', logo: null,                     slugs: ['netflix-usa', 'netflix-eu', 'netflix-united-kingdom'], delivers: 'code', region: ['USA', 'Europe', 'UK'], about: 'brand_about_netflix' },
  { key: 'airbnb',      name: 'Airbnb',            color: ['#ff5a5f', '#7a1b2c'], chip: 'travel',    logo: null,                     slugs: ['airbnb-usa', 'airbnb-united-kingdom'], delivers: 'link', region: ['USA', 'UK'], about: 'brand_about_airbnb' },
  { key: 'googleplay',  name: 'Google Play',       color: ['#0a8f66', '#0b2e24'], chip: 'games',     logo: null,                     slugs: ['google-play-usa', 'google-play-united-kingdom'], delivers: 'code', region: ['USA', 'UK'], about: 'brand_about_googleplay' },
  { key: 'playstation', name: 'PlayStation Store', color: ['#0070d1', '#001a4d'], chip: 'games',     logo: null,                     slugs: ['sony-playstation-usa', 'playstation-united-kingdom'], delivers: 'code', region: ['USA', 'UK'], about: 'brand_about_playstation' },
  { key: 'ubereats',    name: 'Uber Eats',         color: ['#06a85a', '#05331f'], chip: 'food',      logo: null,                     slugs: ['uber-eats-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_ubereats' },
  // below the fold
  { key: 'nintendo',    name: 'Nintendo eShop',    color: ['#e60012', '#5c0008'], chip: 'games',     logo: '/logos/nintendo-eshop.png', tile: { bg: '#E60012', fg: '#fff', letter: 'N' }, slugs: ['nintendo-eshop-usa', 'nintendo-uk'], delivers: 'code', region: ['USA', 'UK'], about: 'brand_about_nintendo' },            // confirm
  { key: 'roblox',      name: 'Roblox',            color: ['#4a4c51', '#131315'], chip: 'games',     logo: null, tile: { bg: '#1b1b1f', fg: '#fff', letter: 'R' }, slugs: ['roblox-usa', 'roblox-european-union', 'roblox-united-kingdom'], delivers: 'code', region: ['USA', 'Europe', 'UK'], about: 'brand_about_roblox' },              // confirm
  { key: 'fortnite',    name: 'Fortnite',          color: ['#1d3a6b', '#0a1530'], chip: 'games',     logo: null, tile: { bg: '#1d3a6b', fg: '#fff', letter: 'F' }, slugs: ['fortnite-uk-united-kingdom'], delivers: 'code', region: ['UK'], about: 'brand_about_fortnite' },            // confirm
  { key: 'valorant',    name: 'Valorant',          color: ['#ff4655', '#5c0f18'], chip: 'games',     logo: null, tile: { bg: '#ff4655', fg: '#fff', letter: 'V' }, slugs: ['valorant-usa', 'valorant-eu'], delivers: 'code', region: ['USA', 'Europe'], about: 'brand_about_valorant' },            // confirm
  { key: 'riot',        name: 'Riot Access',       color: ['#d13639', '#4a1012'], chip: 'games',     logo: null, tile: { bg: '#d13639', fg: '#fff', letter: 'R' }, slugs: ['riot-access-usa', 'riot-access-eu', 'valorant-uk-united-kingdom'], delivers: 'code', region: ['USA', 'Europe', 'UK'], about: 'brand_about_riot' },         // confirm
  { key: 'xbox',        name: 'Xbox',              color: ['#14931a', '#062e08'], chip: 'games',     logo: '/logos/xbox.png', tile: { bg: '#107C10', fg: '#fff', letter: 'X' }, slugs: ['xbox-usa', 'xbox-currency-united-kingdom'], delivers: 'code', region: ['USA', 'UK'], about: 'brand_about_xbox' },                // confirm, out of stock on 5 Nov
  { key: 'discord',     name: 'Discord Nitro',     color: ['#5865f2', '#232782'], chip: 'games',     logo: null, tile: { bg: '#5865f2', fg: '#fff', letter: 'D' }, slugs: ['discord-nitro-usa'], delivers: 'link', region: ['USA'], about: 'brand_about_discord' },       // confirm, maybe refused by the tool
  { key: 'hotels',      name: 'Hotels.com',        color: ['#d32f2f', '#4f0f0f'], chip: 'travel',    logo: null, tile: { bg: '#d32f2f', fg: '#fff', letter: 'H' }, slugs: ['hotels_com-usa', 'hotels_com-uk'], delivers: 'pin', region: ['USA', 'UK'], about: 'brand_about_hotels' },          // confirm
  { key: 'flightgift',  name: 'Flightgift',        color: ['#1f6feb', '#0a2558'], chip: 'travel',    logo: '/logos/flightgift.jpg', logoPlate: 'fill', tile: { bg: '#1F6FEB', fg: '#fff', letter: 'F' }, slugs: ['flightgift-usa', 'flightgift-eu', 'flightgift-gb'], delivers: 'link', region: ['USA', 'Europe', 'UK'], about: 'brand_about_flightgift' },          // confirm
  { key: 'uber',        name: 'Uber',              color: ['#3a3a3e', '#050506'], chip: 'travel',    logo: null, tile: { bg: '#0b0b0d', fg: '#fff', letter: 'U' }, slugs: ['uber-usa', 'uber-and-uber-eats-eu', 'uber-rides-uk'], delivers: 'code', region: ['USA', 'Europe', 'UK'], about: 'brand_about_uber' },                // confirm
  // v1.1.0. Bolt: ride and food credit added with a code in the app (Promotions), no USA version: it opens on UK.
  { key: 'bolt',        name: 'Bolt',              color: ['#11894c', '#06301b'], chip: 'travel',    logo: '/logos/bolt.png', tile: { bg: '#11894C', fg: '#fff', letter: 'B' }, slugs: ['bolt-uk', 'bolt-nigeria'], delivers: 'code', region: ['UK', 'Nigeria'], about: 'brand_about_bolt' },
  { key: 'bestbuy',     name: 'Best Buy',          color: ['#0046be', '#001a4a'], chip: 'shopping',  logo: '/logos/Best-Buy.png', logoPlate: 'fill', tile: { bg: '#0046BE', fg: '#fff', letter: 'B' }, slugs: ['best-buy-usa'], delivers: 'pin', region: ['USA'], about: 'brand_about_bestbuy' },         // confirm
  { key: 'handm',       name: 'H&M',               color: ['#cf000f', '#4a0006'], chip: 'shopping',  logo: null, tile: { bg: '#E50010', fg: '#fff', letter: 'H' }, slugs: ['handm-usa', 'handm-uk'], delivers: 'pin', region: ['USA', 'UK'], about: 'brand_about_handm' },
  { key: 'nike',        name: 'Nike',              color: ['#3a3a3c', '#0b0b0c'], chip: 'shopping',  logo: null, tile: { bg: '#111111', fg: '#fff', letter: 'N' }, slugs: ['nike-usa', 'nike-uk'], delivers: 'pin', region: ['USA', 'UK'], about: 'brand_about_nike' },
  { key: 'disney',      name: 'Disney',            color: ['#1b4fe0', '#08185c'], chip: 'streaming', logo: '/logos/DGC-Logo.png', tile: { bg: '#113CCF', fg: '#fff', letter: 'D' }, slugs: ['disney-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_disney' },              // confirm
  { key: 'twitch',      name: 'Twitch',            color: ['#7d3ce6', '#1f0f45'], chip: 'streaming', logo: null, tile: { bg: '#9146FF', fg: '#fff', letter: 'T' }, slugs: ['twitch-usa', 'twitch-eu', 'twitch-uk'], delivers: 'code', region: ['USA', 'Europe', 'UK'], about: 'brand_about_twitch' },
  { key: 'starbucks',   name: 'Starbucks',         color: ['#00845a', '#002e20'], chip: 'food',      logo: null, tile: { bg: '#00704a', fg: '#fff', letter: 'S' }, slugs: ['starbucks-usa', 'starbucks-uk'], delivers: 'pin', region: ['USA', 'UK'], about: 'brand_about_starbucks' },           // confirm
  { key: 'doordash',    name: 'DoorDash',          color: ['#ff3008', '#6b1403'], chip: 'food',      logo: null, tile: { bg: '#ff3008', fg: '#fff', letter: 'D' }, slugs: ['doordash-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_doordash' },            // confirm
  { key: 'burgerking',  name: 'Burger King',       color: ['#d62300', '#502314'], chip: 'food',      logo: null, tile: { bg: '#D62300', fg: '#fff', letter: 'B' }, slugs: ['burger-king-usa'], delivers: 'code', region: ['USA'], about: 'brand_about_burgerking' },
]

// About this card (Goal Details): about = i18n key of the one-line description; delivers = what the shop sends
// ('code' | 'pin' = card number + PIN | 'link'); region = the versions it sells (USA, Europe, UK, Nigeria; the live catalogue
// decides what shows: catalogBrands().regions). Airbnb, Discord, Flightgift and
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

// Card versions: USA (USD), Europe (EUR), UK (GBP), Nigeria (NGN), in this order. A version is the shop's own
// product (steam-usa, steam-eur-international); what a card works with depends on the brand (Steam: the wallet
// currency; Riot: the account region; others: the store country), so Dibs never guesses it: each version carries
// the shop's line (worksWith, from the server catalogue) and the user picks.
export const REGION_ORDER = ['USA', 'Europe', 'UK', 'Nigeria']
const CURRENCY_OF = { USA: 'USD', Europe: 'EUR', UK: 'GBP', Nigeria: 'NGN' }
const regionRank = (k) => { const i = REGION_ORDER.indexOf(k); return i < 0 ? 99 : i }
const byValue = (x, y) => (Number(x.faceValue) || 0) - (Number(y.faceValue) || 0) || (x.usd ?? 0) - (y.usd ?? 0)

// The version a brand opens on: the user's saved version for that brand (Your accounts, dibs.prefs), else the version
// for the currency the user chose in Dibs (More > Preferences > Currency, lib/currency.js: USD USA, EUR Europe, GBP UK,
// NGN Nigeria; Auto chooses none), else USA, else the brand's first version. Never derived from the Nimiq Pay currency
// or the language. Choosing a currency saves nothing to Your accounts. A chip on the brand sheet only changes what is
// shown; nothing is saved from it (lib/prefs.js). A goal keeps its own version and never reads this again.
export function defaultRegion(brand) {
  const regions = brand?.regions || []
  const find = (key) => (key ? regions.find((r) => r.key === key) : null)
  return find(getPref(brand?.key)) || find(regionForCurrency(getCurrency())) || find('USA') || regions[0] || null
}
// One version of a brand by key, or the default one.
export const brandRegion = (brand, key) => brand?.regions?.find((r) => r.key === key) || defaultRegion(brand)

// Brands that have at least one item in the live catalogue.
//   regions: [{ key, currency, worksWith, items }] (items sorted by value; order USA, Europe, UK, Nigeria)
//   items:   the default version's items, so screens that show one list (tiles, Home) keep working
export function catalogBrands(all = getCatalog()) {
  const map = new Map()
  for (const item of all) {
    // Hidden: out of stock, or a value the shop does not sell (lib/availability.js notSold). Goals already on such a
    // card keep working; they get the "not available" choices instead.
    if (item.inStock === false || notSold(item, all)) continue
    const b = brandOf(item)
    if (!map.has(b.key)) map.set(b.key, { ...b, byRegion: new Map() })
    const r = item.region || 'USA'
    const by = map.get(b.key).byRegion
    if (!by.has(r)) by.set(r, [])
    by.get(r).push(item)
  }
  const order = (k) => { const i = BRANDS.findIndex((b) => b.key === k); return i < 0 ? 99 : i }
  return [...map.values()]
    .map(({ byRegion, ...b }) => {
      const regions = [...byRegion.entries()]
        .map(([key, list]) => {
          const items = list.slice().sort(byValue)
          return { key, currency: items[0].currency || CURRENCY_OF[key] || null, worksWith: items.find((i) => i.worksWith)?.worksWith || null, items }
        })
        .sort((x, y) => regionRank(x.key) - regionRank(y.key))
      const brand = { ...b, regions }
      const def = defaultRegion(brand)
      // estimated: at least one value has no live shop quote (live: false), so its price is the catalogue's
      // stored placeholder (server fallbackUsd) and is only confirmed at checkout.
      // Price line: lib/itemName.js fromText() formats items[0] in the user's language.
      return { ...brand, region: regions.map((r) => r.key), defaultRegion: def.key, items: def.items, estimated: def.items.some((i) => i.live === false) }
    })
    .sort((a, b) => order(a.key) - order(b.key))
}

export function brandLogo(item) {
  return brandOf(item)?.logo || null
}

// A works-with line ({ en, fr, es }) in the user's language, and the sentence shown under a card's values:
// "For Steam accounts with a USD wallet. Check your account before you call dibs." Empty when unknown.
export const worksText = (t, w) => (w ? w[t.lang] || w.en || '' : '')
// A line that already ends with a period ("EE. UU.") does not get a second one from the template.
export const worksLine = (t, w) => (w ? t('works_line', { worksWith: worksText(t, w).replace(/\.\s*$/, '') }) : '')

// Catalogue search: the start of any word in the brand name, any case ("st": Steam, PlayStation Store, Starbucks;
// not Best Buy). chip: a category or 'all'.
export function filterBrands(brands, { q = '', chip = 'all' } = {}) {
  const query = String(q).trim()
  const match = query ? new RegExp(`(^|[^\\p{L}\\p{N}])${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu') : null
  return brands.filter((b) => (chip === 'all' || b.chip === chip) && (!match || match.test(b.name)))
}

// Add a preference: brands sold in more than one version (one version: nothing to choose), with their versions and
// the saved one (prefs: { [brandKey]: versionKey }).
export const prefBrands = (brands, prefs = {}) => brands
  .filter((b) => (b.regions || []).length > 1)
  .map((b) => ({ brand: b, versions: b.regions.map((r) => r.key), saved: b.regions.some((r) => r.key === prefs[b.key]) ? prefs[b.key] : null }))
