import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { getBlockNumber, isDemo } from '../lib/nimiq.js'
import { clockOf, FALLBACK_MS, releaseAtMs } from '../lib/release.js'

// Shared by Stake and Unlock: display only, no money calls.

// Estimated release time from a staker read (null when the chain gives no inactiveFrom, as in demo).
export async function chainReleaseAt(st) {
  const from = Number(st?.inactiveFrom)
  if (!st || !(from > 0) || !(Number(st.inactiveBalance) > 0)) return null
  try { return releaseAtMs(from, Number(await getBlockNumber())) } catch { return null }
}

// The goal's release estimate: the chain's when known, else the deactivate step time + 12 h 4 min.
const estimateOf = (goal, chainAt) => {
  const step = goal.unlockSteps.find((s) => s.step === 'deactivate')
  return chainAt ?? (step ? Date.parse(step.at) + FALLBACK_MS : null)
}

// The clock reads as an estimate. Once it runs out it says "Should be ready now", never 0 or a negative time.
// Only a retire step on record counts as released.
export function ReleaseClock({ goal, chainAt }) {
  const { t } = useApp()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id) }, [])

  const retired = goal.unlockSteps.some((s) => s.step === 'retire')
  const est = estimateOf(goal, chainAt)
  const clock = est == null ? null : clockOf(est - now)
  if (retired) return <div className="ok">{t('stake_released')}</div>
  if (clock?.due) return <div className="countdown-row">{t('stake_release_due')}</div>
  return (
    <>
      <div className="countdown-row">
        <span className="spin" aria-hidden="true" />
        {clock == null ? t('stake_release_unknown') : clock.h > 0 ? t('stake_release_in', { h: clock.h, m: clock.m }) : t('stake_release_in_min', { m: clock.m })}
      </div>
      {isDemo() && chainAt == null && <p className="small">{t('stake_demo_estimate')}</p>}
    </>
  )
}
