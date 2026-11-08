import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../App.jsx'
import { fmtNim } from '../lib/format.js'
import { useCountUp } from '../lib/useCountUp.js'

const PATHS = {
  back: <path d="M15 5l-7 7 7 7" />,
  game: <><rect x="2" y="7" width="20" height="11" rx="5" /><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 12h.01" /></>,
  signal: <path d="M5 19v-3M10 19v-7M15 19V9M20 19V5" />,
  music: <><path d="M9 18V6l11-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  play: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M10 9.5v5l4.5-2.5z" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18" /><path d="M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z" /></>,
  food: <><path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10" /><path d="M16 21V3c2 1 3 4 3 7h-3" /></>,
  travel: <><path d="M3 15l7-2 4-9 2 1-2 8 6-1 1 2-7 3-4 4H7l2-4-6 1z" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
}

export function Icon({ name, size = 22, stroke = 2 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  )
}

// Dibs mark: a lowercase d whose stem ends in a bookmark ribbon (brand kit v1).
// Drop in the official dibs-mark SVG from the brand kit when it is in the repo.
export function Logo({ size = 28, color = 'var(--gold)' }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32">
      <circle cx="13" cy="20" r="8" fill="none" stroke={color} strokeWidth="5" />
      <path d="M24 2v22l-3.5-3-3.5 3V2z" fill={color} />
    </svg>
  )
}

export function Wordmark({ cream = false }) {
  return <img className="wordmark" src={cream ? '/brand/wordmark-cream.png' : '/brand/wordmark-ink.png'} alt="Dibs" />
}

// Brand logo for a catalogue brand (falls back to a letter tile).
export function BrandLogo({ brand, className = '' }) {
  if (!brand?.logo) return <div className={`blogo letter ${className}`} style={brand?.tile ? { background: brand.tile.bg, color: brand.tile.fg } : undefined} aria-hidden="true">{brand?.tile?.letter || (brand?.name || '?')[0]}</div>
  const light = ['amazon', 'playstation', 'googleplay'].includes(brand.key)
  return <img className={`blogo${light ? ' light' : ''} ${className}`} src={brand.logo} alt="" />
}

const LANGS = ['en', 'fr', 'es']

// "EN · FR · ES" segmented control (onboarding, and inside the Home language chip).
export function LangSwitch({ onPick }) {
  const { t, lang, setLang } = useApp()
  return (
    <div className="lang-seg" role="group" aria-label={t('lang_label')}>
      {LANGS.map((l) => (
        <button type="button" key={l} lang={l} aria-pressed={l === lang} className={l === lang ? 'on' : ''}
          onClick={() => { setLang(l); onPick?.(l) }}>{l.toUpperCase()}</button>
      ))}
    </div>
  )
}

// Home header chip: shows the current language, opens the same three choices.
export function LangChip() {
  const { t, lang } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="lang-chip" ref={ref}>
      <button type="button" className="chip" aria-expanded={open} aria-label={`${t('lang_label')}: ${lang.toUpperCase()}`} onClick={() => setOpen((o) => !o)}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" /></svg>
        {lang.toUpperCase()}
      </button>
      {open && <div className="lang-pop"><LangSwitch onPick={() => setOpen(false)} /></div>}
    </div>
  )
}

export function Header({ onBack, onInk = false, langChip = false }) {
  const { t, balance, demo, lang, reset } = useApp()
  const balanceShown = useCountUp(balance)
  return (
    <header className={`header${onInk ? ' on-ink' : ''}`}>
      {onBack ? (
        <button type="button" className="icon-btn" aria-label={t('back')} onClick={onBack}><Icon name="back" stroke={2.2} /></button>
      ) : (
        <div style={{ width: 8 }} aria-hidden="true" />
      )}
      <div className="grow">
        <button type="button" className="home-link" aria-label="Dibs" onClick={() => reset('home')}><Wordmark cream /></button>
      </div>
      {demo && <span className="badge-demo">{t('demo')}</span>}
      {langChip && <LangChip />}
      {balance == null
        ? <span className="chip sk" aria-label={t('goal_reading')}>000,000 NIM</span>
        : <span className="chip">{fmtNim(Math.round(balanceShown), lang)} NIM</span>}
    </header>
  )
}

// One dot per week from the start to the deadline. done = weeks covered, now = current week index.
export function WeekDots({ total, done = 0, now = -1, left, right, planMode = false }) {
  const n = Math.max(1, Math.min(total, 13))
  const scale = total / n
  const dots = []
  for (let i = 0; i < n; i++) {
    const w = Math.round((i + 1) * scale) - 1
    const ok = planMode ? false : w < done
    let cls = 'd'
    if (planMode && i === 0) cls += ' first'
    else if (ok) cls += ' ok'
    else if (!planMode && w === now) cls += ' now'
    if (i === n - 1) cls += ' last' + (ok ? ' ok' : '')
    dots.push(<div key={'d' + i} className={cls} />)
    if (i < n - 1) dots.push(<div key={'l' + i} className={`ln${!planMode && Math.round((i + 2) * scale) - 1 < done ? ' ok' : ''}`} />)
  }
  return (
    <div className="weeks">
      <div className="dots">{dots}</div>
      <div className="lab"><span>{left}</span>{right && <span>{right}</span>}</div>
    </div>
  )
}

export function Ring({ value, size = 120, stroke = 12, track = '#e6dccf', color = '#E8482A', label }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c.toFixed(1)} strokeDashoffset={(c * (1 - Math.min(1, value))).toFixed(1)}
        transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset 600ms ease' }} />
    </svg>
  )
}

export function ErrorBox({ error }) {
  const { t } = useApp()
  if (!error) return null
  return <div className="err" role="alert">{t('error', { msg: error.message || String(error) })}</div>
}

// One message component for every problem (error plan): what happened, is my NIM safe, what to do.
// tone: info | wait | stop | ok
export function Notice({ tone = 'info', title, sub, safe, safeTone = 'g', actions = [] }) {
  const icon = { info: 'i', wait: '', stop: '!', ok: '✓' }[tone]
  return (
    <div className={`notice n-${tone}`} role={tone === 'stop' ? 'alert' : 'status'}>
      <div className="ic" aria-hidden="true">{icon}</div>
      <div>
        <div className="nt">{title}</div>
        {sub && <div className="ns">{sub}</div>}
        {safe && <div className={`safe ${safeTone}`}>{safeTone === 'g' ? '● ' : ''}{safe}</div>}
        {actions.length > 0 && (
          <div className="nacts">
            {actions.map((a, i) => <button type="button" key={a.label} className={`nbtn${i === 0 ? ' pri' : ''}`} onClick={a.onClick}>{a.label}</button>)}
          </div>
        )}
      </div>
    </div>
  )
}

export function FieldError({ children }) {
  return <p className="ferr" role="alert">{children}</p>
}

// Bottom sheet: dimmed backdrop, panel from the bottom. Tap outside or Escape closes it.
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" aria-hidden="true" />
        {title && <h3 className="sheet-title">{title}</h3>}
        {children}
      </div>
    </div>,
    document.body,
  )
}

// "Dibs!" stamp (M4). Decorative: fixed overlay, no pointer events, hidden from screen readers.
// Portalled to <body> so the .screen enter transform cannot become its containing block. Unmounts after 2 s.
export function Stamp() {
  const [on, setOn] = useState(true)
  useEffect(() => { const id = setTimeout(() => setOn(false), 2000); return () => clearTimeout(id) }, [])
  return on ? createPortal(<div className="stamp" aria-hidden="true">Dibs!</div>, document.body) : null
}
