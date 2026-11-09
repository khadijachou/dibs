import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { getBlockNumber, isDemo } from '../lib/nimiq.js'
import { blocksLeft, BLOCK_MS, clockOf, FALLBACK_MS, readyMinute, releaseAtMs, releaseBlockOf } from '../lib/release.js'

// Shared by Stake and Unlock: display only, no money calls.

// Estimated release time from a staker read (null when the chain gives no inactiveFrom, as in demo).
export async function chainReleaseAt(st) {
  const from = Number(st?.inactiveFrom)
  if (!st || !(from > 0) || !(Number(st.inactiveBalance) > 0)) return null
  try { return releaseAtMs(from, Number(await getBlockNumber())) } catch { return null }
}

// The same read with the figures the Unlock timer needs, or null when the chain gives no inactiveFrom or no block.
// released comes from the block height (the chain's truth), at is the wall-clock estimate of the release.
export async function chainRelease(st) {
  const from = Number(st?.inactiveFrom)
  if (!st || !(from > 0) || !(Number(st.inactiveBalance) > 0)) return null
  let block
  try { block = Number(await getBlockNumber()) } catch { return null }
  if (!(block > 0)) return null
  const now = Date.now()
  const left = blocksLeft(from, block)
  return { inactiveFrom: from, block, releaseBlock: releaseBlockOf(from), released: left === 0, at: now + left * BLOCK_MS, readAt: now }
}

// "18h 12m" / "42m" (or "Should be ready now" once the estimate has passed), from a clockOf() result.
export const leftText = (t, clock) =>
  clock.due ? t('stake_release_due') : clock.h > 0 ? t('unl_left_hm', { h: clock.h, m: clock.m }) : t('unl_left_m', { m: clock.m })

// Wall-clock time of day in the user's language: "01:30".
export const timeText = (ms, lang) => new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))

// "Ready around {time}": the one function for the release time of day (timer card, toast, step button).
export const readyTimeText = (ms, lang) => timeText(readyMinute(ms), lang)

// Display only: each chain read re-estimates the release from the block height and moves it by a second or two.
// Keep the shown estimate until a new read moves it by a minute or more, so the card and a toast from an earlier
// read never straddle a minute. The chain's `released` flag is never smoothed.
export function useStableReadyAt(at) {
  const kept = useRef(null)
  if (at == null) kept.current = null
  else if (kept.current == null || Math.abs(at - kept.current) >= 60_000) kept.current = at
  return kept.current
}

// The goal's release estimate: the chain's when known, else the deactivate step time + 12 h 4 min.
const estimateOf = (goal, chainAt) => {
  const step = goal.unlockSteps.find((s) => s.step === 'deactivate')
  return chainAt ?? (step ? Date.parse(step.at) + FALLBACK_MS : null)
}

// The clock reads as an estimate. Once it runs out it says "Should be ready now", never 0 or a negative time.
// retired: from the staker read (retiredBalance covers the goal). Without it, falls back to a retire step on record.
export function ReleaseClock({ goal, chainAt, retired: retiredChain }) {
  const { t } = useApp()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id) }, [])

  const retired = retiredChain ?? goal.unlockSteps.some((s) => s.step === 'retire')
  const est = estimateOf(goal, chainAt)
  // Date.now() at render, not the interval's last tick: a fresh estimate must not read as later than it is.
  const clock = est == null ? null : clockOf(est - Math.max(now, Date.now()))
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
