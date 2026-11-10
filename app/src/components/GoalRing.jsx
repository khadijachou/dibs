import { useEffect, useRef, useState } from 'react'
import { Ring } from './ui.jsx'
import { burstSeen, markBurst } from '../lib/seen.js'

// The goal ring (Home card, Goal screen) with the goal-complete burst. Display only.
// The burst plays once per goal (lib/seen.js dibs.seen.burst), the first time a ring shows the goal at 100 %: after the
// fill reaches 100 % (1.1 s when it fills on screen, as when a deposit lands; 250 ms when it opens already full).
// Until then the stroke stays coral; then: wrapper 1 -> 1.09 -> 1 (500 ms), stroke coral -> mint (350 ms), the %
// text mint, 16 dots out to 62-92 px (800 ms), drifting down and fading. Reduced motion: the colour change only.
const CORAL = '#E8482A'
const MINT = '#15896A'
const DOT_COLORS = ['#E8482A', '#FFC94D', '#2bc48f']
const DOTS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * 2 * Math.PI + (i % 2 ? 0.12 : -0.08)
  const r = 62 + ((i * 7) % 31) // 62 to 92 px
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r, size: 5 + (i % 5), color: DOT_COLORS[i % 3] }
})

function useGoalBurst(goalId, full) {
  const [phase, setPhase] = useState(() => (full && !burstSeen(goalId) ? 'wait' : 'idle')) // idle | wait | go
  const openedFull = useRef(full)
  useEffect(() => {
    if (!full) return undefined
    if (phase === 'idle') { if (!burstSeen(goalId)) setPhase('wait'); return undefined }
    if (phase !== 'wait') return undefined
    const id = setTimeout(() => { markBurst(goalId); setPhase('go') }, openedFull.current ? 250 : 1100)
    return () => clearTimeout(id)
  }, [goalId, full, phase])
  return phase
}

export default function GoalRing({ goal, pct, milestone = null }) {
  const full = pct >= 1
  const phase = useGoalBurst(goal.id, full)
  const mint = full && phase !== 'wait'
  return (
    <div className={`ring-wrap${milestone ? ' ms-pulse' : ''}${phase === 'go' ? ' burst' : ''}`}>
      <Ring value={pct} size={100} label={`${Math.round(pct * 100)}%`} track="#35323f" color={mint ? MINT : CORAL} />
      <div className="pct">{Math.round(pct * 100)}%</div>
      {phase === 'go' && (
        <div className="burst-dots" aria-hidden="true">
          {DOTS.map((d, i) => (
            <i key={i} style={{ '--dx': `${d.dx.toFixed(1)}px`, '--dy': `${d.dy.toFixed(1)}px`, width: d.size, height: d.size, background: d.color }} />
          ))}
        </div>
      )}
    </div>
  )
}
