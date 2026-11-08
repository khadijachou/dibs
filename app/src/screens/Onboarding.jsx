import { useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { Icon, LangSwitch, Wordmark } from '../components/ui.jsx'

// VF screens 02 to 04: three slides on first run. App.jsx shows them without
// waiting for the wallet; onDone stores dibs.onboarded.
const SLIDES = [
  { key: 1, Ill: CardIll },
  { key: 2, Ill: RingIll },
  { key: 3, Ill: CodeIll },
]

export default function Onboarding({ onDone }) {
  const { t } = useApp()
  const [i, setI] = useState(0)
  const last = i === SLIDES.length - 1
  const trust = t('ob_trust').split(' · ')
  const start = useRef(null)
  const goTo = (k) => setI(Math.max(0, Math.min(SLIDES.length - 1, k)))

  // Swipe left/right (touch or mouse drag) changes slide.
  const onPointerDown = (e) => { start.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = (e) => {
    const s = start.current
    start.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) goTo(i + (dx < 0 ? 1 : -1))
  }

  return (
    <div className="app">
      <header className="header ob-top">
        <div className="grow"><Wordmark cream /></div>
        <LangSwitch />
        <button type="button" className="ob-skip" onClick={onDone}>{t('ob_skip')}</button>
      </header>
      <main className="screen ob">
        <div className="ob-view" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { start.current = null }}>
          <div className="ob-track" style={{ transform: `translateX(${-100 * i}%)` }}>
            {SLIDES.map(({ key, Ill }, k) => (
              <section className={`ob-slide${k === i ? ' on' : ''}`} key={key} aria-hidden={k !== i} inert={k !== i}>
                <div className="ob-ill" aria-hidden="true"><Ill /></div>
                <h1 className="ob-title">{t(`ob_${key}t`)}</h1>
                <p className="ob-sub">{t(`ob_${key}s`)}</p>
              </section>
            ))}
          </div>
        </div>
        <div className="ob-dots" aria-hidden="true">{SLIDES.map((s, k) => <i key={s.key} className={k === i ? 'on' : ''} />)}</div>
        <p className="ob-trust"><b><Icon name="check" size={14} stroke={2.6} />{trust[0]}</b>{trust[1] && <span>{trust[1]}</span>}</p>
        <div className="bottom">
          <button type="button" className={`btn ${last ? '' : 'ink'}`} onClick={() => (last ? onDone() : goTo(i + 1))}>
            {last ? t('ob_start') : t('ob_next')}
          </button>
        </div>
      </main>
    </div>
  )
}

// (a) Steam gift card tilted, two NIM coins, a mint check.
function CardIll() {
  const { t } = useApp()
  return (
    <div className="ill-card">
      <i className="coin c1">NIM</i>
      <div className="gcard">
        <img src="/logos/steam.png" alt="" />
        <span className="gc-label">{t('ob_gift')}</span>
        <b className="gc-value">5 USD</b>
        <span className="gc-name">Steam</span>
        <i className="gc-check"><Icon name="check" size={22} stroke={3} /></i>
      </div>
      <i className="coin c2">NIM</i>
    </div>
  )
}

// (b) mint ring at 68 %, "+35.4 NIM earned".
function RingIll() {
  const { t, lang } = useApp()
  const r = 88
  const c = 2 * Math.PI * r
  return (
    <div className="ill-ring">
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={r} fill="none" stroke="#2b2834" strokeWidth="18" />
        <circle cx="100" cy="100" r={r} fill="none" stroke="#2bc48f" strokeWidth="18" strokeLinecap="round"
          strokeDasharray={c.toFixed(1)} strokeDashoffset={(c * 0.32).toFixed(1)} transform="rotate(-90 100 100)" />
      </svg>
      <div className="ir-mid">
        <b>{new Intl.NumberFormat(lang, { style: 'percent' }).format(0.68)}</b>
        <span>{t('goal_earned_row', { amount: new Intl.NumberFormat(lang, { minimumFractionDigits: 1 }).format(35.4) })}</span>
      </div>
    </div>
  )
}

// (c) the card and its orange code card.
function CodeIll() {
  const { t } = useApp()
  return (
    <div className="ill-code">
      <div className="gcard back"><img src="/logos/steam.png" alt="" /></div>
      <div className="ccard">
        <span className="cc-label">{t('done_code')}</span>
        <b>7KQ4N-M2P8V-R9T3W</b>
        <span className="cc-copy">{t('err_copy')}</span>
        <i className="cc-bolt">
          <svg width="26" height="26" viewBox="0 0 24 24"><path d="M13.5 2L4 14h7l-1.5 8L19 10h-7z" fill="#fff" /></svg>
        </i>
      </div>
    </div>
  )
}
