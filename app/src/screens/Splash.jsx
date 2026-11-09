import { useEffect, useRef } from 'react'
import { useApp } from '../App.jsx'

// VF screen 01: shown while start() connects (and at least 900 ms on launch).
// The connecting status stays readable for screen readers.
// The coral ring draws itself in a loop while connecting. When `done` turns true the ring
// completes from wherever it is, the splash fades, then onGone() lets App show the next screen.
// Reduced motion: a static full ring and a small "Loading" line, no fade.
const CARDS = [
  { key: 'steam', name: 'Steam', logo: '/logos/steam.png', price: '5 USD', x: '-14px', y: '10%', r: '-14deg', bg: 'linear-gradient(145deg, #1b2838, #0f1b2b)' },
  { key: 'netflix', name: 'Netflix', logo: '/logos/netflix.png', price: '25 EUR', x: 'calc(100% - 118px)', y: '19%', r: '12deg', bg: 'linear-gradient(145deg, #3a0f12, #1d0a0c)' },
  { key: 'amazon', name: 'Amazon', logo: '/logos/amazon.png', price: '10 USD', x: 'calc(100% - 168px)', y: '74%', r: '-6deg', bg: 'linear-gradient(145deg, #2a2733, #1c1a22)' },
]

const R = 66
const C = 2 * Math.PI * R
const COMPLETE_MS = 450
const FADE_MS = 300

const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

// "Call dibs. Save up. It's yours." -> three lines
const lines = (s) => s.split(/(?<=\.)\s+/)

export default function Splash({ done = false, onGone }) {
  const { t } = useApp()
  const tag = lines(t('splash_tag'))
  const arc = useRef(null)
  const root = useRef(null)

  useEffect(() => {
    if (!done) return
    if (reducedMotion()) { onGone?.(); return }
    const el = arc.current
    if (el) {
      // Freeze the loop where it is, then finish the circle from there.
      const from = getComputedStyle(el).strokeDashoffset
      el.style.animation = 'none'
      el.style.strokeDashoffset = from
      el.getBoundingClientRect() // apply before the transition starts
      el.style.transition = `stroke-dashoffset ${COMPLETE_MS}ms cubic-bezier(.3, .7, .3, 1)`
      el.style.strokeDashoffset = '0'
    }
    const fade = setTimeout(() => root.current?.classList.add('out'), COMPLETE_MS)
    const gone = setTimeout(() => onGone?.(), COMPLETE_MS + FADE_MS)
    return () => { clearTimeout(fade); clearTimeout(gone) }
  }, [done])

  return (
    <div className="app splash" ref={root}>
      <p className="sr-only" role="status">{t('loading')}</p>
      <div className="splash-cards" aria-hidden="true">
        {CARDS.map((c, i) => (
          <div key={c.key} className="fc" style={{ '--x': c.x, '--y': c.y, '--r': c.r, '--d': `${i * -1.3}s`, background: c.bg }}>
            <img src={c.logo} alt="" />
            <b>{c.name}</b>
            <span>{t('cat_from', { price: c.price })}</span>
          </div>
        ))}
      </div>
      <div className="splash-mid">
        <div className="splash-mark" aria-hidden="true">
          <svg viewBox="0 0 156 156">
            <circle className="splash-track" cx="78" cy="78" r={R} fill="none" strokeWidth="12" />
            <circle ref={arc} className="splash-arc" cx="78" cy="78" r={R} fill="none" stroke="#E8482A" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={C.toFixed(1)} transform="rotate(-90 78 78)" style={{ '--c': `${C.toFixed(1)}px` }} />
          </svg>
          <img src="/brand/mark-cream.png" alt="" />
        </div>
        <p className="splash-loading" aria-hidden="true">{t('splash_loading')}</p>
        <img className="splash-word" src="/brand/wordmark-cream.png" alt="Dibs" />
        <p className="splash-tag">
          {tag.map((l, i) => <span key={i} className={i === tag.length - 1 ? 'last' : ''}>{l}</span>)}
        </p>
      </div>
      <p className="splash-line">{t('splash_line')}</p>
    </div>
  )
}
