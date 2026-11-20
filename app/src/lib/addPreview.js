// Add NIM screen: display-only helpers. The amount field shows thousands separators as you type, but the value
// stored and sent to Nimiq Pay stays the raw digits (never the formatted string). Spanish groups thousands with
// ".", so feeding "12.000" to parseNim would read 12: formatAmount is for display, cleanDigits keeps the digits.
// Pure (no browser, no React): node --test runs it.
import { fmtNim } from './format.js'

// The digits a typed value carries, as a plain number string: non-digits dropped, leading zeros trimmed ('' when empty).
export const cleanDigits = (v) => String(v ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '')

// The digits shown with the language's thousands separators ('' for an empty field). Display only.
export const formatAmount = (v, lang = 'en') => {
  const d = cleanDigits(v)
  return d ? fmtNim(Number(d), lang) : ''
}

// How many digit characters sit left of the caret, so the caret can be put back after the same digit once separators move.
export const digitsBefore = (value, caret) => (String(value ?? '').slice(0, caret).match(/\d/g) || []).length

// The caret offset in a formatted string that sits just after its nth digit (0 -> start, past the end -> the end).
export const caretAfterDigits = (formatted, n) => {
  if (n <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (formatted.charCodeAt(i) >= 48 && formatted.charCodeAt(i) <= 57) {
      seen++
      if (seen === n) return i + 1
    }
  }
  return formatted.length
}

// The deposit preview: where this deposit takes the goal. All numbers, no formatting.
//   saved   NIM already in the goal
//   target  the goal's target
//   amount  the typed amount (0 for empty)
//   balance the wallet balance, or null while it is still being read (then nothing is capped)
// counted = the amount, capped at the wallet when it asks for more than the wallet holds. Widths never pass 100 %.
export function addPreview(saved, target, amount, balance) {
  const s = Math.max(0, Number(saved) || 0)
  const tgt = Math.max(0, Number(target) || 0)
  const amt = Math.max(0, Number(amount) || 0)
  const counted = balance == null ? amt : Math.min(amt, Math.max(0, Number(balance) || 0))
  const pctOf = (v) => (tgt > 0 ? (v / tgt) * 100 : 0)
  const savedW = Math.min(100, pctOf(s))
  const addW = Math.max(0, Math.min(100 - savedW, pctOf(counted)))
  const p0 = Math.min(100, Math.round(pctOf(s)))
  const p1 = Math.min(100, Math.round(pctOf(s + counted)))
  return { counted, savedW, addW, p0, p1, total: s + counted }
}
