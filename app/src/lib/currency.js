// Currency (More > Preferences > Currency): Auto, USD, EUR, GBP or NGN. Stored in localStorage dibs.currency; missing
// or anything else = 'auto'. When storage is blocked, a choice holds for this session only. Pure (no SDK), so node
// --test can load it.
//   effectiveCurrency(hostFiat): the code for the header balance value. Auto = the Nimiq Pay currency (v1.0.6).
//   regionForCurrency(choice): the card version a brand opens on (lib/brands.js defaultRegion). Auto = null: Auto never
//   changes which version opens. Nothing is saved to Your accounts from here.
// A choice applies at once: setCurrency fires 'dibs:currency' and the header re-renders (components/ui.jsx).
export const CURRENCIES = ['auto', 'USD', 'EUR', 'GBP', 'NGN']
const KEY = 'dibs.currency'
export const CURRENCY_EVENT = 'dibs:currency'
const REGION_OF = { USD: 'USA', EUR: 'Europe', GBP: 'UK', NGN: 'Nigeria' }
const valid = (v) => (CURRENCIES.includes(v) ? v : 'auto')

let session = null // the last choice, used only when storage is blocked

export function getCurrency() {
  try { return valid(localStorage.getItem(KEY)) } catch { return session || 'auto' }
}

export function setCurrency(choice) {
  const v = valid(choice)
  session = v
  try { localStorage.setItem(KEY, v) } catch { /* storage blocked: session only */ }
  try { window.dispatchEvent(new Event(CURRENCY_EVENT)) } catch { /* no window under node --test */ }
  return v
}

// The chosen currency, or in Auto the Nimiq Pay currency as v1.0.6 reads it (three capital letters, else USD).
export function effectiveCurrency(hostFiat) {
  const c = getCurrency()
  if (c !== 'auto') return c
  const s = String(hostFiat || '').toUpperCase()
  return /^[A-Z]{3}$/.test(s) ? s : 'USD'
}

// USD USA, EUR Europe, GBP UK, NGN Nigeria; Auto or anything else null.
export const regionForCurrency = (choice) => REGION_OF[choice] || null

// Tests only.
export const _resetCurrencyForTest = () => { session = null }
