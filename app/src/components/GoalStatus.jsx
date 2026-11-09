import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { savedNim } from '../lib/goals.js'
import { getStaker } from '../lib/nimiq.js'
import { fmtDate, fmtNim } from '../lib/format.js'
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
