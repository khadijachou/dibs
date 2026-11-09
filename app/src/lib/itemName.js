import { fmtAmount, fmtUsd } from './format.js'

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

export function detailText(t, x, { short = false } = {}) {
  const lang = t.lang || 'en'
  const raw = String(x?.detail ?? x?.itemDetail ?? '').trim()
  let m = AMOUNT.exec(raw)
  if (m) return `${fmtAmount(m[1], lang)}${NBSP}${m[2]}`
  m = DURATION.exec(raw)
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
