import { useEffect, useState } from 'react'

// 25, 50 and 75 %: shown once per goal and milestone (dibs.milestones.<goalId>).
export const MILESTONES = [25, 50, 75]
const key = (goalId) => `dibs.milestones.${goalId}`
const read = (goalId) => { try { return JSON.parse(localStorage.getItem(key(goalId))) || [] } catch { return [] } }
const write = (goalId, list) => { try { localStorage.setItem(key(goalId), JSON.stringify(list)) } catch { /* private mode */ } }

// Marks every milestone the goal has passed as seen and returns the highest new one, or null.
// A jump past several shows only the highest; reaching 100 % shows none (the goal screen says it).
export function takeMilestone(goalId, pct) {
  const seen = read(goalId)
  const crossed = MILESTONES.filter((m) => pct * 100 >= m && !seen.includes(m))
  if (!crossed.length) return null
  write(goalId, [...seen, ...crossed])
  return pct >= 1 ? null : Math.max(...crossed)
}

// The milestone to celebrate on this screen, kept until the screen unmounts.
export function useMilestone(goalId, pct, active = true) {
  const [hit, setHit] = useState(null)
  useEffect(() => {
    if (!goalId || !active) return
    const m = takeMilestone(goalId, pct)
    if (m) setHit(m)
  }, [goalId, pct, active])
  return hit
}
