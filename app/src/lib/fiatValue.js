// The header balance value ("25,145 NIM · $6.05"): pure helpers, no SDK, so node --test can load them.
const NNBSP = new RegExp(String.fromCharCode(0x202f), 'g')
const NBSP = String.fromCharCode(0xa0)

// Three capital letters or USD (the code goes into the CoinGecko URL).
export const fiatCode = (c) => {
  const s = String(c || '').toUpperCase()
  return /^[A-Z]{3}$/.test(s) ? s : 'USD'
}

const ok = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0

// From CoinGecko's "nimiq-2" object: the user's currency when its rate came back, else USD, else null.
export function pickFiat(nim, code) {
  const own = nim?.[code.toLowerCase()]
  if (code !== 'USD' && ok(own)) return { code, rate: own }
  return ok(nim?.usd) ? { code: 'USD', rate: nim.usd } : null
}

// Value of a NIM balance in that currency, or null when there is nothing to show (no balance, no rate).
// Two decimals below 1,000 in that currency, none from 1,000 up (judged on the rounded value).
export function fmtFiatValue(nim, fiat, lang = 'en') {
  if (!Number.isFinite(nim) || nim < 0 || !fiat || !ok(fiat.rate)) return null
  const v = nim * fiat.rate
  const digits = Math.round(v * 100) / 100 >= 1000 ? 0 : 2
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency: fiatCode(fiat.code), minimumFractionDigits: digits, maximumFractionDigits: digits })
      .format(v).replace(NNBSP, NBSP)
  } catch { return null }
}
