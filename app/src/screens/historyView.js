// History screen helpers, plain JS so node --test can load them (lib/historyView.test.js).
// Display only: the rows come from lib/history.js buildTimeline unchanged.

// NIM added on a day: deposits only (not moves, unlocks, withdrawals or purchases).
export const dayDeposits = (events) => events.filter((e) => e.type === 'deposit').reduce((s, e) => s + (Number(e.nim) || 0), 0)

// Time of a row: en "11:12 PM", fr (Quebec) "23 h 12", es "23:12". No-break spaces (U+00A0) before AM/PM and inside
// the French "23 h 12" form, the same rule as components/releaseTime.js clockTime, so a time never breaks across lines.
const NB = '\u00A0' // U+00A0 no-break space
export function fmtTime(at, lang = 'en') {
  const d = new Date(at)
  if (lang === 'fr') return `${d.getHours()}${NB}h${NB}${String(d.getMinutes()).padStart(2, '0')}`
  return new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', { hour: 'numeric', minute: '2-digit' }).format(d).replace(/\s+(AM|PM)$/i, NB + '$1')
}

// Short titles for the three unlock steps (lib/unlockStage.js): lower the active stake (the wait starts),
// retire after the release, remove back to the wallet.
export const UNLOCK_TITLE = { deactivate: 'hist_unlock_started', retire: 'hist_unlock_released', remove: 'hist_unlock_finished' }

// The action badge on the logo. A card change draws an SVG swap icon instead (History.jsx, v1.1.12); its glyph stays
// here as the text fallback.
export const BADGE = { deposit: '+', move: '⇄', unlock: '↧', withdraw: '↩', purchase: '✓', change: '⇄' }
