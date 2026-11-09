// Brand icons from the simple-icons package (CC0, https://simpleicons.org), drawn as inline SVG in the
// brand's official colour. Never hand-drawn. Named imports only, so the build keeps just these paths.
// The shop's catalogue data has no product image, so this is the only logo source besides the
// existing PNG files in public/logos (kept for brands simple-icons does not have).
import {
  siAirbnb, siApple, siDiscord, siDoordash, siFortnite, siGoogleplay, siHotelsdotcom, siNetflix,
  siPlaystation, siRiotgames, siRoblox, siStarbucks, siSteam, siUber, siUbereats, siValorant,
} from 'simple-icons'

// Brand key (lib/brands.js) → simple-icons entry.
// Not in simple-icons 16.36: Amazon (keeps public/logos/amazon.png), Nintendo eShop, Xbox, Flightgift,
// Best Buy, Disney (keep the letter tile).
export const BRAND_ICONS = {
  steam: siSteam,
  apple: siApple,
  netflix: siNetflix,
  airbnb: siAirbnb,
  googleplay: siGoogleplay,
  playstation: siPlaystation,
  ubereats: siUbereats,
  roblox: siRoblox,
  fortnite: siFortnite,
  valorant: siValorant,
  riot: siRiotgames, // Riot Access is Riot Games' own card
  discord: siDiscord,
  hotels: siHotelsdotcom,
  uber: siUber,
  starbucks: siStarbucks,
  doordash: siDoordash,
}

export const brandIcon = (key) => BRAND_ICONS[key] || null

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
