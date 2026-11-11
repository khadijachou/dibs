// What Dibs sells, as rules (scripts/catalog.js and the tests use them; the server only reads catalog.json).
//
// Versions: USA (USD), Europe (EUR), UK (GBP), Nigeria (NGN). Nothing else. A version comes from the shop's own
// country and currency, never from the user's wallet or language. Europe is one Europe-wide EUR product
// (country EU): per-country cards like Amazon.de are not a Europe version.
// Values: the fixed packages paid in USD whose payment price is 100 USD or less, at most 8 per product
// (the largest are dropped first).
export const REGIONS = ['USA', 'Europe', 'UK', 'Nigeria']
export const MAX_USD = 100
export const MAX_VALUES = 8

// { region, currency } for a product, or null when Dibs does not sell that version.
// Country XI is the shop's "international" USD card (Roblox USD, Hotels.com USD): it is the USA version.
export function regionOf({ country, currency }) {
  if (currency === 'USD' && (country === 'US' || country === 'XI')) return { region: 'USA', currency }
  if (currency === 'EUR' && country === 'EU') return { region: 'Europe', currency }
  if (currency === 'GBP' && country === 'GB') return { region: 'UK', currency }
  if (currency === 'NGN' && country === 'NG') return { region: 'Nigeria', currency }
  return null
}

// The packages Dibs keeps, smallest first.
export function keptPackages(packages) {
  return packages
    .filter((p) => p.priceCurrency === 'USD' && Number.isFinite(p.price) && p.price <= MAX_USD)
    .sort((a, b) => Number(a.value) - Number(b.value) || a.price - b.price)
    .slice(0, MAX_VALUES)
}

// New ids: <slug>-<value>, "." as "-" ("valorant-usa-9-99"). Existing ids are never renamed.
export const itemId = (slug, value) => `${slug}-${value}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+$/, '')

// "20 USD" for an amount; anything else (a Discord plan) as the shop wrote it.
export const detailOf = (value, currency) => (/^\d+(\.\d+)?$/.test(value) ? `${value} ${currency}` : value)

// A works-with line: { en, fr, es }, plain words, no em dash, no exclamation mark.
export function validWorksWith(w) {
  return Boolean(w) && ['en', 'fr', 'es'].every((l) => typeof w[l] === 'string' && w[l].trim() && !/[—!]/.test(w[l]))
}
