import { useEffect, useState } from 'react'
import { listGoals } from './goals.js'
import { getBadges } from './badges.js'
import { XP_EVENT, xpSummary } from './xp.js'

// XP, level, rank and rhythm for screens (lib/xp.js xpSummary). Re-read when goals, badges, visits, quests or
// shares change (dibs:goals, dibs:badges, dibs:xp).
export function useXp(address) {
  const compute = () => xpSummary({ goals: address ? listGoals(address) : [], badges: getBadges() })
  const [summary, setSummary] = useState(compute)
  useEffect(() => {
    const on = () => setSummary(compute())
    const events = ['dibs:goals', 'dibs:badges', XP_EVENT]
    events.forEach((e) => window.addEventListener(e, on))
    on()
    return () => events.forEach((e) => window.removeEventListener(e, on))
  }, [address]) // eslint-disable-line react-hooks/exhaustive-deps
  return summary
}
