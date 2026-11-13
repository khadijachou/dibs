import { useEffect, useRef } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, CREAM, DibsMark, Wordmark } from '../components/ui.jsx'
import { detailText } from '../lib/itemName.js'
import { BRANDS } from '../lib/brands.js'

// Logos: the Dibs mark and wordmark (DibsMark, Wordmark) are vector; each card draws its BRANDS entry (found by key)
// with BrandLogo, so the splash always shows the same logo as the rest of the app.
// VF screen 01: shown while start() connects (and at least 900 ms on launch).
// The connecting status stays readable for screen readers.
// The coral ring draws itself in a loop while connecting. When `done` turns true the ring
// completes from wherever it is, the splash fades, then onGone() lets App show the next screen.
// Reduced motion: a static full ring and a small "Loading" line, no fade.
const CARDS = [
  { key: 'steam', name: 'Steam', price: '5 USD', x: '-14px', y: '10%', r: '-14deg', dur: '5.5s', bg: 'linear-gradient(145deg, #1b2838, #0f1b2b)' },
  { key: 'netflix', name: 'Netflix', price: '25 EUR', x: 'calc(100% - 118px)', y: '19%', r: '12deg', dur: '6.5s', bg: 'linear-gradient(145deg, #3a0f12, #1d0a0c)' },
  { key: 'apple', name: 'Apple', price: '10 USD', x: '-18px', y: '76%', r: '8deg', dur: '6s', bg: 'linear-gradient(145deg, #2a2733, #1c1a22)' },
  { key: 'amazon', name: 'Amazon', price: '10 USD', x: 'calc(100% - 168px)', y: '74%', r: '-6deg', dur: '7s', bg: 'linear-gradient(145deg, #2a2733, #1c1a22)' },
]

// The official Nimiq logo, path copied unchanged from @nimiq/style 0.8.5 (src/icons/hexagon.svg). Never redraw it.
const NimiqHex = () => (
  <svg className="splash-nq" viewBox="0 0 27 24" width="14" height="14" aria-hidden="true">
    <path fill="currentColor" d="M26.6991 10.875L21.0741 1.125C20.6691 0.4275 19.9266 0 19.1241 0H7.87414C7.07164 0 6.32914 0.4275 5.92789 1.125L0.302891 10.875C-0.0983594 11.5725 -0.0983594 12.4275 0.302891 13.125L5.92789 22.875C6.32914 23.5725 7.07164 24 7.87414 24H19.1241C19.9266 24 20.6691 23.5725 21.0704 22.875L26.6954 13.125C27.1004 12.4275 27.1004 11.5725 26.6991 10.875Z" />
  </svg>
)

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
          <div key={c.key} className="fc" style={{ '--x': c.x, '--y': c.y, '--r': c.r, '--d': `${i * -1.3}s`, '--dur': c.dur, background: c.bg }}>
            <BrandLogo brand={BRANDS.find((b) => b.key === c.key) || c} />
            <b>{c.name}</b>
            <span>{t('cat_from', { price: detailText(t, { detail: c.price }) })}</span>
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
          <DibsMark className="splash-dmark" color={CREAM} />
        </div>
        <p className="splash-loading" aria-hidden="true">{t('splash_loading')}</p>
        <Wordmark className="splash-word" />
        <p className="splash-tag">
          {tag.map((l, i) => <span key={i} className={i === tag.length - 1 ? 'last' : ''}>{l}</span>)}
        </p>
      </div>
      <p className="splash-line"><NimiqHex />{t('splash_line')}</p>
    </div>
  )
}
