import { useEffect, useId, useRef, useState } from 'react'
import { Ring } from './ui.jsx'
import { burstSeen, markBurst } from '../lib/seen.js'
import { useApp } from '../App.jsx'
import { fmtNim } from '../lib/format.js'
import { useXp } from '../lib/useXp.js'
import { getLook, LOOK_EVENT } from '../lib/looks.js'

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

// A ready goal (lib/readyState.js) draws its own ring in one colour: covered = full mint ring and "100%"; wallet / short =
// the saved part solid, the part still needed in the same colour at 30 %, and "+{gap}" over "NIM to add". No burst.
const R = 52
const C = 2 * Math.PI * R
function ReadyRing({ rs }) {
  const { t, lang } = useApp()
  const savedPart = rs.kind === 'covered' ? 1 : Math.max(0, Math.min(1, rs.saved / rs.price))
  const label = rs.kind === 'covered' ? '100%' : `+${fmtNim(rs.gap, lang)} ${t('ready_to_add')}`
  return (
    <div className={`ring-wrap ready ready-${rs.kind}`}>
      <svg role="img" aria-label={label} width={100} height={100} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#35323f" strokeWidth={12} />
        {savedPart < 1 && (
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--rs)" strokeOpacity={0.3} strokeWidth={12}
            strokeDasharray={`${(C * (1 - savedPart)).toFixed(1)} ${C.toFixed(1)}`} strokeDashoffset={(-C * savedPart).toFixed(1)} transform="rotate(-90 60 60)" />
        )}
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--rs)" strokeWidth={12} strokeLinecap={savedPart < 1 ? 'butt' : 'round'}
          strokeDasharray={`${(C * savedPart).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 60 60)" />
      </svg>
      <div className="pct" aria-hidden="true">
        {rs.kind === 'covered' ? '100%' : <><span className="gap">+{fmtNim(rs.gap, lang)}</span><small>{t('ready_to_add')}</small></>}
      </div>
    </div>
  )
}

export default function GoalRing({ goal, pct, milestone = null, ready = null }) {
  if (ready) return <ReadyRing rs={ready} />
  return <ProgressRing goal={goal} pct={pct} milestone={milestone} />
}

// The user's goal-ring style (lib/looks.js), live. A style never outlives its rank: getLook replaces a locked or
// unknown choice with the default (solid). Re-reads on a look change (equipping in My look) and on XP change (the level
// decides what is unlocked).
function useRingStyle() {
  const { address } = useApp()
  const { level } = useXp(address)
  const [, bump] = useState(0)
  useEffect(() => {
    const on = () => bump((n) => n + 1)
    window.addEventListener(LOOK_EVENT, on)
    return () => window.removeEventListener(LOOK_EVENT, on)
  }, [])
  return getLook(level).ring
}

// A styled saving ring (lib/looks.js RINGS, never solid, never at 100 %): the same R=52 arc as the default ring, but
// the progress is painted through a mask so the "how much" (the mask arc, animated like the default fill) is kept
// apart from the "pattern" (segments for steps, dots for dots, a soft glow for glow, gold for gold, a gradient for
// sunset). Display only. The percent text, milestone pulse, burst and the ready/full ring are unchanged.
const STYLE = {
  gold: { paint: '#E9B213', cap: 'round' },
  glow: { paint: CORAL, cap: 'round', glow: true },
  steps: { paint: CORAL, cap: 'butt', dash: '8 2' }, // 10 segments over pathLength 100
  dots: { paint: CORAL, cap: 'round', dash: '0.8 4' },
  sunset: { paint: 'gradient', cap: 'round', grad: ['#E8482A', '#FFC94D'] },
}
export function StyleRing({ value, size = 100, style = 'gold' }) {
  const uid = useId().replace(/[^a-z0-9]/gi, '')
  const cfg = STYLE[style] || STYLE.gold
  const v = Math.max(0, Math.min(1, value))
  const maskId = `lkm-${uid}`
  const gradId = `lkg-${uid}`
  const stroke = cfg.paint === 'gradient' ? `url(#${gradId})` : cfg.paint
  return (
    <svg role="img" aria-label={`${Math.round(v * 100)}%`} width={size} height={size} viewBox="0 0 120 120">
      <defs>
        {cfg.grad && (
          <linearGradient id={gradId} x1="0" y1="120" x2="120" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={cfg.grad[0]} /><stop offset="1" stopColor={cfg.grad[1]} />
          </linearGradient>
        )}
        <mask id={maskId}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="#fff" strokeWidth={13} pathLength={100}
            strokeDasharray={`${(v * 100).toFixed(2)} 100`} strokeLinecap="butt" transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dasharray 600ms ease' }} />
        </mask>
      </defs>
      <circle cx="60" cy="60" r={R} fill="none" stroke="#35323f" strokeWidth={12} />
      <g mask={`url(#${maskId})`} className={cfg.glow ? 'lk-ring-glow' : undefined}>
        <circle cx="60" cy="60" r={R} fill="none" stroke={stroke} strokeWidth={12} pathLength={100}
          strokeDasharray={cfg.dash || undefined} strokeLinecap={cfg.cap} transform="rotate(-90 60 60)" />
      </g>
    </svg>
  )
}

function ProgressRing({ goal, pct, milestone }) {
  const full = pct >= 1
  const phase = useGoalBurst(goal.id, full)
  const mint = full && phase !== 'wait'
  const ring = useRingStyle()
  const styled = !mint && ring !== 'solid' // default (solid) and the full/mint ring stay exactly as before
  return (
    <div className={`ring-wrap${milestone ? ' ms-pulse' : ''}${phase === 'go' ? ' burst' : ''}${styled ? ` lk-ring lk-ring-${ring}` : ''}`}>
      {styled
        ? <StyleRing value={pct} size={100} style={ring} />
        : <Ring value={pct} size={100} label={`${Math.round(pct * 100)}%`} track="#35323f" color={mint ? MINT : CORAL} />}
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
