// Brand icons from the simple-icons package (CC0, https://simpleicons.org), drawn as inline SVG in the
// brand's official colour. Never hand-drawn. Named imports only, so the build keeps just these paths.
// The shop's catalogue data has no product image, so this is the only logo source besides the
// existing PNG files in public/logos (kept for brands simple-icons does not have).
import {
  siAirbnb, siBurgerking, siDiscord, siDoordash, siGoogleplay, siHandm, siHotelsdotcom, siNetflix,
  siNike, siPlaystation, siRiotgames, siRoblox, siStarbucks, siTwitch, siUbereats, siValorant,
} from 'simple-icons'

// Brand key (lib/brands.js) → simple-icons entry.
// Not in simple-icons 16.36: Amazon, Nintendo eShop, Xbox, Flightgift, Best Buy, Disney, Bolt. They use files in
// public/logos (lib/brands.js logo). Steam, Apple, Uber and Fortnite use their official logo files too (v1.1.7).
export const BRAND_ICONS = {
  netflix: siNetflix,
  airbnb: siAirbnb,
  googleplay: siGoogleplay,
  playstation: siPlaystation,
  ubereats: siUbereats,
  roblox: siRoblox,
  valorant: siValorant,
  riot: siRiotgames, // Riot Access is Riot Games' own card
  discord: siDiscord,
  hotels: siHotelsdotcom,
  starbucks: siStarbucks,
  doordash: siDoordash,
  handm: siHandm,
  nike: siNike, // #111111: black swoosh on the white plate (brandColor falls back to the neutral tint)
  twitch: siTwitch,
  burgerking: siBurgerking,
}

export const brandIcon = (key) => BRAND_ICONS[key] || null

// Brands whose simple-icons colour is black or near black: drawn like their real app icons instead of a black glyph
// on a white plate. Everything else keeps the brand-coloured glyph on white.
//   Steam, Apple, Uber left in v1.1.7 (official logo files on the white plate).
//   Roblox stays black on white (its app icon is the dark tilted square on a light ground).
//   Google Play stays on white (#414141 glyph; the real icon is multicolour, never dark).
export const DARK_TILES = {}

// Tint for the tile and the press glow. Brands whose official colour is black or near-black would vanish on
// the dark card: Steam uses its official light blue, the others a neutral silver.
const NEUTRAL = '#C9C6D2'
const TINT = { amazon: '#FF9900', steam: '#66C0F4', googleplay: NEUTRAL }
const luminance = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}
export function brandColor(brand) {
  if (!brand) return NEUTRAL
  if (TINT[brand.key]) return TINT[brand.key]
  const hex = brandIcon(brand.key) ? `#${brandIcon(brand.key).hex}` : brand.tile?.bg
  if (!hex) return NEUTRAL
  return luminance(hex) < 0.12 ? NEUTRAL : hex
}
