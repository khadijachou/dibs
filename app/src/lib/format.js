export const fmtNim = (n, lang = 'en') =>
  new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(Math.floor(n))

export const fmtUsd = (n, lang = 'en') =>
  new Intl.NumberFormat(lang, { maximumFractionDigits: n < 1 ? 5 : 2 }).format(n)

export const fmtDate = (d, lang = 'en') =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(new Date(d))

export const addDays = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export const weeksUntil = (iso) => Math.max(1, Math.ceil((new Date(iso) - Date.now()) / (7 * 864e5)))
