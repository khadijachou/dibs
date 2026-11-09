// Every number and date on screen goes through this file, so they read the same everywhere.
// Intl puts U+202F (narrow no-break space) in fr numbers and percents; Inter renders it at
// zero width, so it is swapped for U+00A0 after every Intl call.
const NNBSP = new RegExp(String.fromCharCode(0x202f), 'g')
const NBSP = String.fromCharCode(0xa0)
const nbsp = (s) => s.replace(NNBSP, NBSP)
const num = (lang, opts, n) => nbsp(new Intl.NumberFormat(lang, opts).format(n))

// Whole numbers (NIM, sats).
export const fmtInt = (n, lang = 'en') => num(lang, { maximumFractionDigits: 0 }, Math.floor(n))
export const fmtNim = fmtInt

// USD: 2 decimals from 1 USD up (10.50); below 1 (the NIM rate) 3 significant digits (0.000270).
export const fmtUsd = (n, lang = 'en') =>
  num(lang, n >= 1 || n === 0
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumSignificantDigits: 3, maximumSignificantDigits: 3 }, n)

// A card's face value ("50", "9.99"): whole numbers stay whole (50), others get 2 decimals (9.99, fr 9,99).
export const fmtAmount = (n, lang = 'en') =>
  num(lang, Number.isInteger(Number(n)) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }, Number(n))

// Share of 1 as a percentage (0.68 -> "68%", fr "68 %").
export const fmtPct = (x, lang = 'en') => num(lang, { style: 'percent', maximumFractionDigits: 0 }, x)

export const fmtDate = (d, lang = 'en') =>
  nbsp(new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(new Date(d)))

// Day and month, plus the year when it is not this year (Profile, "Saving since").
export const fmtDateYear = (d, lang = 'en') => {
  const date = new Date(d)
  const opts = { day: 'numeric', month: 'long', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }
  return nbsp(new Intl.DateTimeFormat(lang, opts).format(date))
}

export const addDays = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export const weeksUntil = (iso) => Math.max(1, Math.ceil((new Date(iso) - Date.now()) / (7 * 864e5)))
