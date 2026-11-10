import { useApp } from '../App.jsx'
import { progress } from '../lib/goals.js'
import { useMilestone } from '../lib/milestones.js'
import { getName } from '../lib/name.js'

// Only while saving: a goal being unlocked or bought has nothing left to celebrate.
export function useGoalMilestone(goal) {
  return useMilestone(goal?.id, goal ? progress(goal) : 0, goal?.status === 'saving')
}

// "Halfway, Sam." / "Halfway." The ring pulse is CSS (.ms-pulse), off under reduced motion.
export function MilestoneLine({ milestone }) {
  const { t } = useApp()
  if (!milestone) return null
  const name = getName()
  return (
    <p className="ms-line" role="status">
      <span className="ms-ic" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></svg>
      </span>
      <span className="ms-txt">{t(`ms_${milestone}${name ? '_name' : ''}`, { name })}</span>
    </p>
  )
}
