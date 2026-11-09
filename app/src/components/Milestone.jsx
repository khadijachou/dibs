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
  return <p className="ms-line" role="status">{t(`ms_${milestone}${name ? '_name' : ''}`, { name })}</p>
}
