// Saving plan maths shared by the Plan and Goal screens (UI v2.2).
import { savedNim } from './goals.js'
import { config } from './config.js'

const DAY = 864e5
const WEEK = 7 * DAY

export function planOf(goal, now = Date.now()) {
  const start = new Date(goal.createdAt).getTime()
  const end = new Date(goal.deadline).getTime()
  const totalWeeks = Math.max(1, Math.ceil((end - start) / WEEK))
  const weekly = Math.ceil(goal.targetNim / totalWeeks)
  const saved = savedNim(goal)
  const remaining = Math.max(0, goal.targetNim - saved)
  const weekIdx = Math.min(totalWeeks - 1, Math.max(0, Math.floor((now - start) / WEEK)))
  const weekEnd = new Date(start + (weekIdx + 1) * WEEK)
  const dueByWeekEnd = Math.min(goal.targetNim, weekly * (weekIdx + 1))
  const weeksLeft = Math.max(1, Math.ceil((end - now) / WEEK))
  const daysLeft = Math.max(0, Math.ceil((end - now) / DAY))
  const weeksDone = Math.min(totalWeeks, Math.floor(saved / weekly))
  let pace
  if (saved >= goal.targetNim) pace = { kind: 'done' }
  else if (saved >= dueByWeekEnd) {
    const nextIdx = Math.floor(saved / weekly)
    pace = { kind: 'ahead', date: new Date(start + nextIdx * WEEK + WEEK) }
  } else if (saved >= 0.9 * weekly * weekIdx) {
    pace = { kind: 'onTrack', amount: dueByWeekEnd - saved, date: weekEnd }
  } else {
    pace = { kind: 'behind', amount: Math.ceil(remaining / weeksLeft), date: new Date(end) }
  }
  return { totalWeeks, weekly, saved, remaining, weekIdx, weeksLeft, daysLeft, weeksDone, pace }
}

// Known pools, by validator address. Plan and Goal both show this name.
const POOLS = { 'NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7': 'Garuda Pool' }
export const poolName = () => POOLS[config.defaultValidator] || shortAddress(config.defaultValidator) || 'Nimiq staking'

export const shortAddress = (a) => {
  if (!a) return ''
  const p = String(a).trim().split(/\s+/)
  return p.length > 3 ? `${p[0]} ${p[1]} … ${p[p.length - 1]}` : a
}
