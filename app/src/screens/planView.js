// Call dibs flow (v1.1.8): pure helpers for the brand sheet and the plan page, no React, so node --test loads them.
import { usdToNim } from '../lib/price.js'
import { targetUsdOf } from '../lib/readyState.js'

// The NIM shown under a value on the brand sheet: exactly the plan target (lib/readyState.js targetUsdOf, with its
// margin for estimated prices, then lib/price.js usdToNim). null without a price yet.
export function valueNim(item, nimUsd) {
  if (!item || item.usd == null || !(nimUsd > 0)) return null
  return usdToNim(targetUsdOf(item), nimUsd)
}

// The card the plan uses: the value picked on the sheet when it is one of this version's values (still in the
// catalogue), otherwise the version's first value. found = false when an itemId was passed but is not there.
export function pickPlanItem(amounts = [], itemId = null) {
  const hit = itemId ? amounts.find((a) => a.id === itemId) : null
  return { item: hit || amounts[0] || null, found: !itemId || Boolean(hit) }
}

// Weeks in a plan, the same rule as the weekly amount (at least 1).
export const planWeeks = (days) => Math.max(1, Math.ceil(days / 7))

// The plan timeline: Today, one dot per week (12 weeks or less) or per month, then the deadline.
// count = every dot, Today and the deadline included: 2 weeks = 3, 2 months = 10, 6 months = 7.
export function timelineDots(days) {
  const weeks = planWeeks(days)
  if (weeks <= 12) return { unit: 'week', count: weeks + 1 }
  const months = Math.max(1, Math.round(days / 30.4375))
  return { unit: 'month', count: months + 1 }
}

// Your wallet row: whole percent of the target, floored, at most 100. null when the balance is unknown.
export function walletPct(balance, target) {
  if (balance == null || !Number.isFinite(Number(balance)) || !(target > 0)) return null
  return Math.max(0, Math.min(100, Math.floor((Number(balance) / target) * 100)))
}

// "115K": the weekly amount on an option pill.
export function fmtCompact(n, lang = 'en') {
  try { return new Intl.NumberFormat(lang, { notation: 'compact' }).format(n) } catch { return String(n) }
}

// Minutes since the price was read (Updated row). null without a timestamp.
export function minsSince(at, now = Date.now()) {
  if (!Number.isFinite(at)) return null
  return Math.max(0, Math.floor((now - at) / 60000))
}
