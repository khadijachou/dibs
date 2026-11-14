// What the goal's card costs in NIM today, and what moved. Display only: goal.targetNim is read, never written.
// The figures come from readyState (lib/readyState.js), so they match the ReadyBox exactly.
import { readyState, targetUsdOf } from './readyState.js'
import { usdToNim } from './price.js'
import { fmtNim } from './format.js'

// Rounded to the nearest whole percent, the same way up and down (0.5 -> 1, -0.5 -> -1), never -0.
export const pctOf = (change, base) => {
  const r = Math.sign(change) * Math.round(Math.abs((change / base) * 100))
  return r === 0 ? 0 : r
}

export function cardToday(goal, item, prices, { free = null, rate7d = null } = {}) {
  try {
    const target = Number(goal?.targetNim)
    const live = Boolean(item && item.usd != null && prices?.nimUsd > 0 && prices.live !== false)
    if (!live) return { live: false, planNim: Number.isFinite(target) ? target : null }
    const known = free != null && Number.isFinite(Number(free))
    const rs = readyState(goal, item, prices, known ? free : 0)
    const out = { live: true, price: rs.price, saved: rs.saved, gap: rs.gap, free: rs.free, kind: rs.kind, toAdd: rs.toAdd, since: null, sincePct: null, d7: null, d7Pct: null }
    if (!known) Object.assign(out, { kind: rs.gap === 0 ? 'covered' : 'unknown', free: null, toAdd: null })
    const unchanged = !goal.cardChanges || goal.cardChanges.length === 0
    if (typeof goal.nimUsdAtCreate === 'number' && goal.nimUsdAtCreate > 0 && unchanged && target > 0) {
      out.since = rs.price - target
      out.sincePct = pctOf(out.since, target)
    }
    if (typeof rate7d === 'number' && rate7d > 0) {
      const older = usdToNim(targetUsdOf(item), rate7d)
      out.d7 = rs.price - older
      out.d7Pct = pctOf(out.d7, older)
    }
    return out
  } catch {
    return { live: false, planNim: null }
  }
}

const MINUS = '−'
// A change in NIM: "+1,234", "−56", "0" (no sign).
export const fmtChange = (n, lang = 'en') => (n === 0 ? '0' : (n > 0 ? '+' : MINUS) + fmtNim(Math.abs(n), lang))
// A change in percent: "+18%" in en and es, "+18 %" in fr (no-break space), "0%" with no sign.
export const fmtPctChange = (p, lang = 'en') => {
  const v = (p === 0 ? '' : p > 0 ? '+' : MINUS) + String(Math.abs(p))
  return lang === 'fr' ? `${v} %` : `${v}%`
}
