import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../App.jsx'
import { fmtNim } from '../lib/format.js'
import { useCountUp } from '../lib/useCountUp.js'
import { brandIcon, DARK_TILES } from '../lib/brandIcons.js'
import { useFullscreen } from '../lib/fullscreen.js'
import FullscreenSheet from './FullscreenSheet.jsx'

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
  expand: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />, // four corners (full screen)
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></>,
  tabGoals: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />, // house (Home tab)
  tabStake: <><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
  tabHistory: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  tabProfile: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" /></>,
  tabMore: <><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></>,
}

// Bottom tab bar on the four top-level screens (App.jsx decides where it shows).
const TABS = [
  { route: 'home', icon: 'tabGoals', label: 'tab_goals' },
  { route: 'stake', icon: 'tabStake', label: 'tab_stake' },
  { route: 'history', icon: 'tabHistory', label: 'tab_history' },
  { route: 'profile', icon: 'tabProfile', label: 'tab_profile' },
  { route: 'more', icon: 'tabMore', label: 'tab_more' },
]
export const TAB_ROUTES = TABS.map((x) => x.route)

// The pill behind the active tab's icon: measured on the icon (not the label), slides to the new tab (250 ms, like
// the catalogue chip highlight). The first placement and reduced motion jump.
const PILL_W = 52
const PILL_H = 26
function useTabPill(current) {
  const bar = useRef(null)
  const pill = useRef(null)
  const placed = useRef(false)
  useLayoutEffect(() => {
    const place = () => {
      const nav = bar.current
      const icon = nav?.querySelector('.tab.on svg')
      const el = pill.current
      if (!nav || !el) return
      if (!icon) { el.style.opacity = '0'; return }
      const n = nav.getBoundingClientRect()
      const r = icon.getBoundingClientRect()
      const x = r.left - n.left + r.width / 2 - PILL_W / 2
      const y = r.top - n.top + r.height / 2 - PILL_H / 2
      el.classList.toggle('slide', placed.current)
      el.style.transform = `translate(${x}px, ${y}px)`
      el.style.opacity = '1'
      placed.current = true
    }
    place()
    const onResize = () => { placed.current = false; place() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [current])
  return { bar, pill }
}

export function TabBar({ current }) {
  const { t, reset } = useApp()
  const { bar, pill } = useTabPill(current)
  return (
    <nav className="tabbar" aria-label={t('tabs_label')} ref={bar}>
      <i className="tab-pill" ref={pill} aria-hidden="true" />
      {TABS.map((x) => (
        <button type="button" key={x.route} className={`tab${x.route === current ? ' on' : ''}`} aria-current={x.route === current ? 'page' : undefined}
          onClick={() => { if (x.route !== current) { reset(x.route); window.scrollTo(0, 0) } }}>
          <Icon name={x.icon} size={22} stroke={x.icon === 'tabMore' ? 2.6 : 1.9} />
          <span>{t(x.label)}</span>
        </button>
      ))}
    </nav>
  )
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

// The Dibs mark exactly as in the app icon (public/favicon.svg, the 1024 vector master): a lowercase d whose
// stem ends in a bookmark notch. Vector, so it is sharp at any density. Box: 192 x 246.
// As strings too: the badge medal (components/Badge.jsx) and the share poster draw the same mark from SVG markup.
export const MARK_RING = 'M0 153.5a96 96 0 1 0 192 0a96 96 0 1 0-192 0ZM57.5 153a38.5 38.5 0 1 0 77 0a38.5 38.5 0 1 0-77 0Z'
export const MARK_RIBBON = '135,0 163.5,28.5 192,0 192,246 135,246'
const MARK = (
  <>
    <path fillRule="evenodd" d={MARK_RING} />
    <polygon points={MARK_RIBBON} />
  </>
)
export const CREAM = '#FFF6EC'
export const INK = '#23212B'
export const CORAL = '#E8482A' // the brand coral, same value as --gold in styles.css

// The single "d" (brand mark): the same drawing and box as public/dibs-logo/dibs-mark-*.svg. The box is a little
// taller than the stem (ring centre 153.5, radius 96, so the ring ends at 249.5): the ring is never cut.
// Drawn inline, not loaded as a file, so the splash shows it on the first frame and its colour can be set.
export function DibsMark({ className = '', color = CORAL }) {
  return <svg className={className} aria-hidden="true" viewBox="-0.5 -0.5 193 250.5" fill={color}>{MARK}</svg>
}

// "dibs" wordmark (brand kit): the mark as the "d", then "ibs" in Poppins Bold (700), letter-spacing -0.012em.
// The letters are Poppins Bold outlines (from the font file), so the wordmark never waits for the web font and
// is sharp at any density. The mark is drawn in coral, "ibs" in cream (ink on light). Box 360 x 139, like
// public/dibs-logo/dibs-wordmark-*.svg, so the ring of the "d" is not cut: mark at x 0 to 98, baseline at y 136.6,
// font size 169.8 in this box. A color prop still makes the whole wordmark one colour.
// Size it with CSS height only (.wordmark 26 px, .splash-word 34 px).
export const IBS = 'M117 16.43Q117 9.64 121.84 5.14Q126.68 0.64 134.32 0.64Q141.79 0.64 146.63 5.14Q151.47 9.64 151.47 16.43Q151.47 23.05 146.63 27.55Q141.79 32.05 134.32 32.05Q126.68 32.05 121.84 27.55Q117 23.05 117 16.43ZM148.75 41.9V136.64H119.72V41.9ZM226 40.54Q237.72 40.54 247.23 46.49Q256.73 52.43 262.25 63.46Q267.77 74.5 267.77 89.1Q267.77 103.7 262.25 114.82Q256.73 125.95 247.23 131.97Q237.72 138 226 138Q215.99 138 208.51 134.01Q201.04 130.02 196.8 123.4V136.64H167.77V11H196.8V55.31Q200.87 48.69 208.51 44.62Q216.16 40.54 226 40.54ZM217.34 65.84Q208.68 65.84 202.66 72.12Q196.63 78.41 196.63 89.27Q196.63 100.14 202.66 106.42Q208.68 112.7 217.34 112.7Q226 112.7 232.11 106.33Q238.23 99.97 238.23 89.1Q238.23 78.24 232.2 72.04Q226.17 65.84 217.34 65.84ZM275.92 105.57H304.61Q305.12 110.49 309.2 113.55Q313.27 116.61 319.22 116.61Q324.65 116.61 327.62 114.48Q330.59 112.36 330.59 108.97Q330.59 104.89 326.35 102.94Q322.1 100.99 312.59 98.61Q302.41 96.23 295.61 93.6Q288.82 90.97 283.9 85.28Q278.98 79.59 278.98 69.92Q278.98 61.77 283.48 55.06Q287.97 48.35 296.72 44.45Q305.46 40.54 317.52 40.54Q335.34 40.54 345.62 49.37Q355.89 58.2 357.42 72.8H330.59Q329.91 67.88 326.26 64.99Q322.61 62.11 316.67 62.11Q311.57 62.11 308.86 64.06Q306.14 66.01 306.14 69.41Q306.14 73.48 310.47 75.52Q314.8 77.56 323.97 79.59Q334.5 82.31 341.12 84.94Q347.74 87.57 352.75 93.43Q357.76 99.29 357.93 109.14Q357.93 117.46 353.26 123.99Q348.59 130.53 339.84 134.26Q331.1 138 319.55 138Q307.16 138 297.48 133.76Q287.8 129.51 282.2 122.13Q276.6 114.74 275.92 105.57Z'
export function Wordmark({ cream = true, color, className = '' }) {
  const letters = color || (cream ? CREAM : INK)
  return (
    <svg className={`wordmark ${className}`} role="img" aria-label="Dibs" viewBox="0 0 360 139">
      <g fill={color || CORAL} transform="translate(0 11) scale(0.510417)">{MARK}</g>
      <path fill={letters} d={IBS} />
    </svg>
  )
}

// The brand logo tile, the one component for every brand logo in the app (catalogue, goal cards, Plan, timer ring,
// flip face, Stake, sheets, splash, onboarding). Always the same box: a div.blogo tile that clips its content
// (overflow hidden), with one glyph inside (.blogo-glyph):
//   si:     the brand's simple-icons glyph, inline SVG in its official colour, contained at 64 % on a white plate
//           (si dark: brands whose colour is black, drawn like their app icon, lib/brandIcons.js DARK_TILES)
//   img:    the brand PNG (Amazon only), contained with padding on a white plate
//   letter: the brand's letter in white on the brand colour
// Containers only set the tile's size and radius (.ut-logo .blogo { width: 68px }); the glyph rules are specific
// enough that a container rule such as `.ut-ring svg { position: absolute; width: 100% }` can never reach it.
export function BrandLogo({ brand, className = '' }) {
  const icon = brandIcon(brand?.key)
  if (icon) {
    const dark = DARK_TILES[brand.key] // black-logo brands drawn like their app icons (Steam: white on #171A21)
    return (
      <div className={`blogo si${dark ? ' dark' : ''} ${className}`} style={dark ? { background: dark.bg } : undefined} aria-hidden="true">
        <svg className="blogo-glyph" viewBox="0 0 24 24" fill={dark ? dark.fg : `#${icon.hex}`}><path d={icon.path} /></svg>
      </div>
    )
  }
  if (brand?.logo) {
    const plate = brand.logoPlate
    return (
      <div className={`blogo img${plate === 'fill' ? ' fill' : ''} ${className}`} style={plate && plate !== 'fill' ? { background: plate } : undefined} aria-hidden="true">
        <img className="blogo-glyph" src={brand.logo} alt="" />
      </div>
    )
  }
  return (
    <div className={`blogo letter ${className}`} style={brand?.tile ? { background: brand.tile.bg, color: brand.tile.fg } : undefined} aria-hidden="true">
      <span className="blogo-glyph">{brand?.tile?.letter || (brand?.name || '?')[0]}</span>
    </div>
  )
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
  const fs = useFullscreen()
  const [fsAsk, setFsAsk] = useState(false)
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
      {/* Only inside Nimiq Pay, and hidden in full screen: Nimiq Pay shows its own exit button there. */}
      {fs.supported && !fs.on && (
        <button type="button" className="icon-btn fs-btn" aria-label={t('fs_btn')} onClick={() => setFsAsk(true)}><Icon name="expand" size={20} /></button>
      )}
      {fsAsk && <FullscreenSheet onClose={() => setFsAsk(false)} />}
    </header>
  )
}

// One dot per week from the start to the deadline. done = weeks covered, now = current week index.
// One dot per week, sized to always fit the card (CSS var --n). Above BAR_WEEKS weeks a continuous bar instead.
// Done dots use the class "done", never "ok": .ok is the global mint notice band and its padding inflated them.
const BAR_WEEKS = 20
export function WeekDots({ total, done = 0, now = -1, left, right, planMode = false }) {
  const n = Math.max(1, total)
  const lab = (left || right) && <div className="lab"><span>{left}</span>{right && <span>{right}</span>}</div>
  if (n > BAR_WEEKS) {
    const pct = planMode ? 0 : Math.min(100, (done / n) * 100)
    const nowPct = planMode || now < 0 ? null : Math.min(100, ((now + 0.5) / n) * 100)
    return (
      <div className="weeks">
        <div className="wbar" role="img" aria-label={left || undefined}>
          <i className="fill" style={{ width: `${pct}%` }} />
          {nowPct != null && now >= done && <i className="mark" style={{ left: `${nowPct}%` }} />}
          <i className={`end${pct >= 100 ? ' done' : ''}`} />
        </div>
        {lab}
      </div>
    )
  }
  const dots = []
  for (let i = 0; i < n; i++) {
    const ok = !planMode && i < done
    let cls = 'd'
    if (planMode && i === 0) cls += ' first'
    else if (ok) cls += ' done'
    else if (!planMode && i === now) cls += ' now'
    if (i === n - 1) cls += ' last'
    dots.push(<div key={'d' + i} className={cls} />)
    if (i < n - 1) dots.push(<div key={'l' + i} className={`ln${!planMode && i + 1 < done ? ' done' : ''}`} />)
  }
  return (
    <div className="weeks">
      <div className="dots" style={{ '--n': n }}>{dots}</div>
      {lab}
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
// label: the dialog's accessible name when the sheet draws its own heading (no title).
export function Sheet({ title, label, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label || title} onClick={(e) => e.stopPropagation()}>
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
