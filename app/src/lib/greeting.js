// Welcome back, line 3: one status line from data the app already has. Pure, so it can be tested in node.
// First match wins: a goal ready to buy (100 % saved, or unlocked and waiting) > the goal closest to done > none.
// Staking earned since the last visit is appended to the goal line from +0.01 NIM.
import { progress, savedNim } from './goals.js'
import { fmtEarned } from './format.js'

const OPEN = (g) => g.status !== 'redeemed' && g.status !== 'withdrawn'

export function pickStatus(goals = []) {
  const open = goals.filter(OPEN)
  const ready = open.find((g) => g.status === 'ready') || open.find((g) => g.status === 'saving' && savedNim(g) >= g.targetNim)
  if (ready) return { kind: 'ready', goal: ready }
  // Saving goals, and a goal waiting for its release (unlocking) when nothing else is open.
  const closest = [...open].sort((a, b) => progress(b) - progress(a))[0]
  if (closest) return { kind: 'goal', goal: closest, pct: Math.min(100, Math.floor(progress(closest) * 100)) }
  return { kind: 'none' }
}

// Rounded to 1e-6 so 0.03 - 0.02 still counts as 0.01.
export const earnedDelta = (current, prev) =>
  current == null || prev == null ? null : Math.round((Number(current) - Number(prev)) * 1e6) / 1e6
export const showEarned = (delta) => delta != null && delta >= 0.01

// Numbers are wrapped in B0 ... B1 so the screen can draw them in <b>; plainText() drops the marks.
export const B0 = '\u0002'
export const B1 = '\u0003'
const bold = (s) => `${B0}${s}${B1}`

// item(goal) -> the goal's short name (WeekCard's). delta: earned since the last visit, or null when unknown.
export function statusLine(goals, { t, lang = 'en', item, delta = null }) {
  const s = pickStatus(goals)
  if (s.kind === 'ready') return t('greet_ready', { item: item(s.goal) })
  if (s.kind === 'none') return t('greet_none')
  let line = t('greet_goal', { item: item(s.goal), pct: bold(s.pct) })
  if (showEarned(delta)) line += ' ' + t('greet_earned', { earned: bold(fmtEarned(delta, lang).replace(/^\+/, '')) })
  return line
}

export const plainText = (s) => String(s).split(B0).join('').split(B1).join('')
// [{ text, bold }] for rendering.
export const boldParts = (s) => String(s).split(B0).flatMap((chunk, i) => {
  if (i === 0) return chunk ? [{ text: chunk, bold: false }] : []
  const [b, rest = ''] = chunk.split(B1)
  return [{ text: b, bold: true }, ...(rest ? [{ text: rest, bold: false }] : [])]
})
