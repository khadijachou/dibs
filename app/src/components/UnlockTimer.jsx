import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo } from './ui.jsx'
import { leftText, readyTimeText } from './ReleaseClock.jsx'
import { clockOf, progressOf } from '../lib/release.js'
import { playPop } from '../lib/sound.js'

// Unlock step 2 timer: display only, no money calls.
// Ring from the step 1 time (startMs) to the estimated release (releaseMs); `released` comes from the chain.
// Motion is transform and opacity only, every loop pauses while the page is hidden, and reduced motion
// gets a static ring at its current fill with no pulse, drift, roll or particles.

const R = 66
const C = 2 * Math.PI * R
const BURST = 14

const reducedQuery = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)') } catch { return null } }

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => Boolean(reducedQuery()?.matches))
  useEffect(() => {
    const q = reducedQuery()
    if (!q) return undefined
    const on = () => setReduced(q.matches)
    q.addEventListener?.('change', on)
    return () => q.removeEventListener?.('change', on)
  }, [])
  return reduced
}

export function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

// Big countdown: digits roll up softly when they change, units stay put.
function Digits({ text, roll }) {
  const prev = useRef(null)
  const flags = useRef([])
  if (prev.current !== text) {
    const old = prev.current
    flags.current = [...text].map((ch, i) => (old == null ? false : old[i] !== ch ? true : flags.current[i] ?? false))
    prev.current = text
  }
  return (
    <span className="ut-digits" aria-hidden="true">
      {[...text].map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={`${i}-${ch}`} className="ut-u">{/\s/.test(ch) ? ' ' : ch}</span>
        // The outer box clips, the inner one rolls up from below when this digit just changed.
        return <span key={`${i}-${ch}`} className="ut-d"><span className={roll && flags.current[i] ? 'roll' : ''}>{ch}</span></span>
      })}
    </span>
  )
}

export function UnlockTimer({ brand, startMs, releaseMs, released }) {
  const { t, lang } = useApp()
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const [now, setNow] = useState(Date.now())
  const [burst, setBurst] = useState(false)
  const wasReleased = useRef(released)

  // One tick a second is enough for minutes; none while hidden.
  useEffect(() => {
    if (!visible || released) return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [visible, released])

  // The release seen live (not on open): one burst, and the Dibs! pop only if a tap already unlocked audio.
  useEffect(() => {
    if (released && wasReleased.current === false) {
      playPop({ ifUnlocked: true })
      if (!reduced) {
        setBurst(true)
        // Removed when the last particle ends (onAnimationEnd below); this is only a safety net.
        const id = setTimeout(() => setBurst(false), 5000)
        wasReleased.current = released
        return () => clearTimeout(id)
      }
    }
    wasReleased.current = released
    return undefined
  }, [released, reduced])

  const p = released ? 1 : progressOf(startMs, releaseMs, now)
  const clock = clockOf(releaseMs - now)
  const left = released ? '' : leftText(t, clock)
  const deg = p * 360

  return (
    <section className={`card ut${released ? ' released' : ''}${visible ? '' : ' paused'}${reduced ? ' still' : ''}`} aria-live="polite">
      <div className="ut-glow" aria-hidden="true" />
      <div className="ut-ring">
        <svg viewBox="0 0 156 156" aria-hidden="true">
          <circle className="ut-track" cx="78" cy="78" r={R} fill="none" strokeWidth="10" />
          <circle className="ut-arc" cx="78" cy="78" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - p)).toFixed(2)} transform="rotate(-90 78 78)" />
        </svg>
        {!released && <div className="ut-tip" style={{ transform: `rotate(${deg.toFixed(2)}deg)` }} aria-hidden="true"><i /></div>}
        <div className="ut-logo"><BrandLogo brand={brand} /></div>
        {burst && (
          <div className="ut-burst" aria-hidden="true" onAnimationEnd={(e) => { if (e.target.dataset.last) setBurst(false) }}>
            {Array.from({ length: BURST }, (_, i) => {
              const a = (i / BURST) * 2 * Math.PI + (i % 2 ? 0.18 : 0)
              const d = 92 + (i % 3) * 14
              return <i key={i} data-last={i === 3 ? '1' : undefined} className={i % 2 ? 'b' : 'm'} style={{ '--x': `${(Math.cos(a) * d).toFixed(1)}px`, '--y': `${(Math.sin(a) * d).toFixed(1)}px`, '--d': `${150 + (i % 4) * 30}ms` }} />
            })}
          </div>
        )}
      </div>
      {released ? (
        <p className="ut-done">{t('unl_timer_released')}</p>
      ) : (
        <>
          {clock.due
            ? <p className="ut-due">{left}</p>
            : <p className="ut-count"><span className="sr-only">{left}</span><Digits text={left} roll={!reduced} /></p>}
          <p className="ut-ready">{t('unl_timer_ready', { time: readyTimeText(releaseMs, lang) })}</p>
          <p className="ut-close">{t('unl_timer_close')}</p>
        </>
      )}
    </section>
  )
}
