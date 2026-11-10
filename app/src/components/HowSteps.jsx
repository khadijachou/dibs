import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { poolName } from '../lib/pace.js'

// How Dibs works, four steps. Each number sits in a coral ring that draws itself all the way round, one step after
// the other. Used by the first-run pop-up (plays at once) and by Home before the first goal (plays when scrolled
// into view, once). Reduced motion: shown complete, no animation.
const STEPS = ['add', 'earn', 'unlock', 'card']
const R = 16
const C = 2 * Math.PI * R

export default function HowSteps({ reveal = false }) {
  const { t } = useApp()
  const ref = useRef(null)
  const [go, setGo] = useState(!reveal)
  useEffect(() => {
    if (!reveal || go) return
    const el = ref.current
    if (!el || typeof IntersectionObserver !== 'function') { setGo(true); return }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setGo(true); io.disconnect() } }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [reveal, go])
  return (
    <ol ref={ref} className={`hiw-steps${go ? ' go' : ''}`}>
      {STEPS.map((k, i) => (
        <li key={k} className="hiw-step" style={{ '--i': i }}>
          <span className="hiw-ring" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="40" height="40">
              <circle cx="20" cy="20" r={R} className="hiw-track" />
              <circle cx="20" cy="20" r={R} className="hiw-arc" strokeDasharray={C.toFixed(2)} style={{ '--c': C.toFixed(2) }} transform="rotate(-90 20 20)" />
            </svg>
            <b>{i + 1}</b>
          </span>
          <span className="hiw-txt">
            <b>{t(`fs_${k}`)}</b>
            <small>{t(`fs_${k}_sub`, { pool: poolName() })}</small>
          </span>
        </li>
      ))}
    </ol>
  )
}
