import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { savedNim } from '../lib/goals.js'
import { getStaker } from '../lib/nimiq.js'
import { fmtDate, fmtNim } from '../lib/format.js'
import { planOf } from '../lib/pace.js'
import { chainReleaseAt, ReleaseClock } from './ReleaseClock.jsx'

// Where a goal is, from the ledger it already has (no new storage):
// saving -> reached (100%, not unlocking yet) -> unlocking (waiting for release) -> ready (released, can buy) -> bought,
// or unlocking -> withdrawn.
export function goalState(goal) {
  if (goal.status === 'redeemed') return 'bought'
  if (goal.status === 'withdrawn') return 'withdrawn'
  if (goal.status === 'ready') return 'ready'
  if (goal.status === 'unlocking') return 'unlocking'
  return savedNim(goal) >= goal.targetNim ? 'reached' : 'saving'
}

// The one status line under the amount on the goal card (Home) and the goal hero (Goal).
// earned: this goal's share of the rewards (Stake's figure), when known.
export function GoalStatus({ goal, earned }) {
  const { t, lang } = useApp()
  const state = goalState(goal)
  if (state === 'unlocking') return <div className="goal-status wait"><Releasing goal={goal} /></div>
  if (state === 'saving' && savedNim(goal) <= 0) return null // nothing staked yet
  const text = {
    saving: earned > 0 ? t('home_earned_chip', { amount: fmtNim(earned, lang) }) : t('status_saving'),
    reached: t('status_reached'),
    ready: t('status_ready'),
    bought: t('status_bought', { date: fmtDate(goal.payment?.at || goal.createdAt, lang) }),
    withdrawn: t('status_withdrawn'),
  }[state]
  return <div className={`goal-status ${state}`}>{text}</div>
}

// Pace of a saving goal for the status dot and the Details band: 'on' (on track or ahead), 'behind' (one week),
// 'late' (two weeks or more). null at 100 % or once the goal is past saving.
export function goalPace(goal, now = Date.now()) {
  if (!goal || goalState(goal) !== 'saving') return null
  const p = planOf(goal, now)
  const tone = p.pace.kind === 'late' ? 'late' : p.pace.kind === 'behind' ? 'behind' : 'on'
  return { tone, lagWeeks: p.lagWeeks, plan: p }
}

// The status dot: top right of the goal card on Home (pin), or at the start of the Details band (inline).
export function GoalDot({ goal, inline = false }) {
  const { t } = useApp()
  const pace = goalPace(goal)
  if (!pace) return null
  const label = pace.tone === 'on' ? t('dot_on')
    : pace.tone === 'behind' ? t('dot_behind_one')
    : t('dot_behind_other', { n: pace.lagWeeks })
  return <span className={`goal-dot ${pace.tone}${inline ? ' inline' : ' pin'}`} role="img" aria-label={label} />
}

// The shared release clock, fed with the chain's estimate when it can be read (display only).
function Releasing({ goal }) {
  const { address } = useApp()
  const [chainAt, setChainAt] = useState(null)
  useEffect(() => {
    let live = true
    getStaker(address).then(chainReleaseAt).then((at) => { if (live) setChainAt(at) })
    return () => { live = false }
  }, [address])
  return <ReleaseClock goal={goal} chainAt={chainAt} />
}
