import { fmtAmount, fmtUsd } from './format.js'
import { brandOf } from './brands.js'

// Display names in the user's language. The shop names cards "Steam gift card"; we show them through the
// cat_item key ("carte-cadeau Steam", "tarjeta de regalo Steam"). Display only: goals keep their stored
// itemName, so goals created before this keep working. Names that are not "… gift card" (top-ups, other
// products) are shown as the shop names them.
const SUFFIX = / gift card$/i

// raw: "Steam gift card" or a stored label "Steam gift card · 20 USD". title: capitalise the first letter
// (start of a title or a line), otherwise keep cat_item's case for use inside a sentence.
export function localName(t, raw, { title = false } = {}) {
  const str = String(raw ?? '')
  // Stored labels ("Netflix · 25 EUR") keep a plain space; join number and currency so "EUR" never wraps alone.
  const [name, ...rest] = str.split(' · ').map((part) => part.replace(/(\d) ([A-Z]{3})\b/g, `$1${String.fromCharCode(0xa0)}$2`))
  if (!SUFFIX.test(name.trim())) return [name, ...rest].join(' · ')
  let s = t('cat_item', { brand: name.trim().replace(SUFFIX, '') })
  if (title) s = s.charAt(0).toUpperCase() + s.slice(1)
  return [s, ...rest].join(' · ')
}

// A goal ({ itemName }) or a catalogue item ({ name }).
export const itemName = (t, x, opts) => localName(t, x?.itemName ?? x?.name, opts)
// A card value as the shop sends it (item.detail, goal.itemDetail): an amount ("9.99 USD") or a duration
// ("1 Year", Discord Nitro). Shown in the user's language through format.js and i18n:
//   amount   → "9.99 USD" / fr "9,99 USD" / es "9,99 USD"
//   duration → "1 Year · 101.99 USD" / fr "1 an · 101,99 USD" (the price is what the user pays, from usd);
//              short: "1 Year" alone, where the price is shown next to it (Plan pill, goal tab, flip face).
// Anything else is shown as the shop wrote it.
const NBSP = String.fromCharCode(0xa0)
const AMOUNT = /^(\d+(?:\.\d+)?)\s+([A-Z]{3})$/
const DURATION = /^(\d+)\s+(year|month)s?$/i
export const isAmountDetail = (x) => AMOUNT.test(String(x?.detail ?? x?.itemDetail ?? '').trim())

// Read some shop plan labels as a duration so they go through the dur_* keys (translated). Display only:
// the stored value, the catalogue and what is sent to the shop never change. Rules, all on the whole text:
//   drop a trailing " Subscription" / " Plan"  → "1 Year Subscription" is "1 Year", "2 Years Subscription" "2 Years"
//   short forms "1M" / "1Y" / "2Y" (Surfshark) → n months / n years
//   "Semiannual" = 6 months, "Annual" = 1 year  (ExitLag)
// What this returns is handed to the DURATION regex. Anything it does not turn into "<n> year(s)/month(s)"
// ("365 Personal", Discord's "Basic", "1 Year" already a duration) is returned unchanged, so detailText then
// falls back to the raw text exactly as today.
function planDuration(raw) {
  const s = raw.replace(/\s+(?:subscription|plan)$/i, '')
  let m = /^(\d+)\s*M$/i.exec(s)
  if (m) return `${m[1]} Month`
  m = /^(\d+)\s*Y$/i.exec(s)
  if (m) return `${m[1]} Year`
  if (/^semiannual$/i.test(s)) return '6 Month'
  if (/^annual$/i.test(s)) return '1 Year'
  return s
}

// Some shop plan values repeat the brand ("Surfshark 1M", "Surfshark 1Y"): the tile and sheet already show the brand,
// so for display we drop a leading brand-name prefix (case-insensitive, followed by a space) and keep just "1M". The
// stored value, the catalogue and what is sent to the shop never change. The brand name is the goal's stored brandName,
// else the brand the item belongs to (brandOf needs the item's shopUrl; synthetic objects have neither and are left as
// is). A value that does not start with the brand name (NordPass "1 Year Subscription") is untouched.
const brandNameOf = (x) => x?.brandName || (x?.shopUrl ? brandOf(x)?.name : null)
function dropBrandPrefix(raw, name) {
  if (!name) return raw
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i')
  return raw.replace(re, '')
}

export function detailText(t, x, { short = false } = {}) {
  const lang = t.lang || 'en'
  const raw = dropBrandPrefix(String(x?.detail ?? x?.itemDetail ?? '').trim(), brandNameOf(x))
  let m = AMOUNT.exec(raw)
  if (m) return `${fmtAmount(m[1], lang)}${NBSP}${m[2]}`
  m = DURATION.exec(planDuration(raw))
  if (!m) return raw
  const n = Number(m[1])
  const dur = t(`dur_${m[2].toLowerCase()}_${n === 1 ? 'one' : 'other'}`, { count: n })
  return short || x?.usd == null ? dur : `${dur} · ${fmtUsd(x.usd, lang)}${NBSP}USD`
}

// A brand tile's price line from its cheapest item: "From 9.99 USD", or for a duration "1 Year · 101.99 USD"
// ("From …" only when there are several durations).
export function fromText(t, brand) {
  const min = brand?.items?.[0]
  if (!min) return ''
  if (isAmountDetail(min)) return t('cat_from', { price: detailText(t, min) })
  return brand.items.length > 1 ? t('cat_from', { price: detailText(t, min) }) : detailText(t, min)
}

// "Carte-cadeau Steam · 20 USD", "Discord Nitro · 1 an · 101,99 USD"
export const itemLabel = (t, g, { title = true } = {}) => `${itemName(t, g, { title })} · ${detailText(t, g)}`

// Card-type phrases, exactly as cat_item builds them (en suffix, fr/es prefix).
const CARD_TYPES = ['gift card', 'carte-cadeau', 'tarjeta de regalo']

// keepTail: make the end of a goal label unbreakable so a long title wraps earlier and never leaves a lone
// "·" at the end of a line. Display only (never the stored name). "Nintendo eShop gift card · 20 USD" shows
// as "Nintendo eShop" / "gift card · 20 USD": the "· value" tail and the card-type words stay on one piece,
// only the name's own spaces still break. A label with no card-type words just glues its last word, the dot
// and the value (durations, top-ups). v1.7.8.
export function keepTail(label) {
  const str = String(label ?? '')
  const glue = (s) => s.replace(/ /g, NBSP)
  // The "· value" tail: the space before the first "·", around it and inside the value never break.
  let out = str.replace(/ (· .*)$/s, (_, tail) => NBSP + glue(tail))
  // Keep the card-type phrase itself on one piece ("gift card", "tarjeta de regalo").
  for (const ct of CARD_TYPES) {
    const i = out.toLowerCase().indexOf(ct)
    if (i >= 0) { out = out.slice(0, i) + glue(out.slice(i, i + ct.length)) + out.slice(i + ct.length); break }
  }
  return out
}
