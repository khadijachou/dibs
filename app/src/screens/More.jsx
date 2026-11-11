import { useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { NAME_MAX, getName, setName } from '../lib/name.js'
import { catalogBrands } from '../lib/brands.js'
import { NumbersCard } from '../components/StatsConsent.jsx'
import { prefCount } from '../lib/prefs.js'
import { siX } from 'simple-icons'
import { APP_VERSION, HELP_EMAIL } from '../components/LegalText.jsx'
import { copyText } from '../lib/clipboard.js'
import { FAQ } from './Faq.jsx'

const X_URL = 'https://x.com/calldibs_app'

// Four rounded squares (Browse the catalogue). A stroke icon: text glyphs turn into emoji on iOS.
const GridIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </svg>
)

// An arrow out of a tray (Share Dibs).
const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V3" /><path d="M7.5 7.5 12 3l4.5 4.5" /><path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12" />
  </svg>
)

// A card (Your accounts).
const CardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" />
  </svg>
)

// Three sliders (Preferences).
const SlidersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
  </svg>
)

// A shield (Privacy).
const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
  </svg>
)

// A page with a folded corner (Terms).
const DocIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" />
  </svg>
)

// A gift (Rewards).
const GiftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13M12 8C10 4 6 4 7 7c.5 1.5 3 1 5 1zM12 8c2-4 6-4 5-1-.5 1.5-3 1-5 1z" />
  </svg>
)

// A spark (What's new).
const SparkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" />
  </svg>
)

// The X logo (simple-icons, official glyph), white on a black circle (.si.x).
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={siX.path} /></svg>
)

// An arrow pointing up and out: the row opens outside the app. A stroke icon: text arrows turn into emoji on iOS.
const OutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7" /><path d="M8 7h9v9" />
  </svg>
)

export default function More() {
  const { t, go, showHowTo, toast } = useApp()
  const nPrefs = prefCount()
  const followX = () => { copyText(X_URL).then((ok) => { if (ok) toast(t('follow_copied')) }) }
  const copyEmail = async () => { if (await copyText(HELP_EMAIL)) toast(t('help_copied')) }
  // Share Dibs: the system share sheet where there is one, else copy the text and link. Nothing goes to our server.
  const shareDibs = async () => {
    const url = window.location.origin
    const text = t('share_text')
    if (navigator.share) {
      try { await navigator.share({ title: 'Dibs', text, url }); return } catch (e) { if (e?.name === 'AbortError') return }
    }
    if (await copyText(`${text} ${url}`)) toast(t('share_copied'))
  }

  return (
    <>
      <Header />
      <main className="screen">
        <h2 className="title">{t('tab_more')}</h2>
        <NumbersCard />

        <section className="more-sec">
          <button type="button" className="sheet-row" onClick={showHowTo}>
            <span className="si" aria-hidden="true">?</span>
            <span><b>{t('more_howto')}</b><small>{t('more_howto_sub')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          <button type="button" className="sheet-row" onClick={() => go('browse')}>
            <span className="si" aria-hidden="true"><GridIcon /></span>
            <span><b>{t('browse_more')}</b><small>{t('browse_more_sub', { count: catalogBrands().length })}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          <button type="button" className="sheet-row" onClick={shareDibs}>
            <span className="si" aria-hidden="true"><ShareIcon /></span>
            <span><b>{t('share_row')}</b><small>{t('share_row_sub')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          {/* Inside Nimiq Pay the link opens nothing: the tap also copies it. No preventDefault, so X opens where links work. */}
          <a className="sheet-row" href={X_URL} target="_blank" rel="noopener noreferrer" onClick={followX}>
            <span className="si x" aria-hidden="true"><XIcon /></span>
            <span><b>{t('follow_row')}</b><small>{t('follow_row_sub')}</small></span>
            <span className="chev ext" aria-hidden="true"><OutIcon /></span>
          </a>
          <button type="button" className="sheet-row faq-row" onClick={() => go('faq')}>
            <span className="si" aria-hidden="true">?</span>
            <span><b>{t('more_faq')}</b><small>{t('faq_row_sub', { n: FAQ.length })}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        </section>

        <section className="more-sec">
          <div className="sec-head"><h3>{t('more_settings')}</h3></div>
          <NameRow />
          <p className="small">{t('name_device')}</p>
          <button type="button" className="sheet-row" onClick={() => go('accounts')}>
            <span className="si" aria-hidden="true"><CardIcon /></span>
            <span><b>{t('accounts_row')}</b><small>{nPrefs ? t('accounts_row_sub', { n: nPrefs }) : t('accounts_row_none')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          <button type="button" className="sheet-row" onClick={() => go('prefs')}>
            <span className="si" aria-hidden="true"><SlidersIcon /></span>
            <span><b>{t('prefs_row')}</b><small>{t('prefs_row_sub')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        </section>

        <section className="help-card">
          <h3>{t('help_title')}</h3>
          <p>{t('help_body')}</p>
          <button type="button" className="help-email" aria-label={t('help_email')} onClick={copyEmail}>{HELP_EMAIL}</button>
        </section>

        <section className="more-sec">
          <div className="sec-head"><h3>{t('more_legal')}</h3></div>
          <button type="button" className="sheet-row" onClick={() => go('legal', { page: 'privacy' })}>
            <span className="si" aria-hidden="true"><ShieldIcon /></span>
            <span><b>{t('legal_privacy')}</b><small>{t('legal_privacy_sub')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          <button type="button" className="sheet-row" onClick={() => go('legal', { page: 'terms' })}>
            <span className="si" aria-hidden="true"><DocIcon /></span>
            <span><b>{t('legal_terms')}</b><small>{t('legal_terms_sub')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          <button type="button" className="sheet-row" onClick={() => go('legal', { page: 'rewards' })}>
            <span className="si" aria-hidden="true"><GiftIcon /></span>
            <span><b>{t('legal_rewards')}</b><small>{t('legal_rewards_sub')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          <button type="button" className="sheet-row" onClick={() => go('legal', { page: 'news' })}>
            <span className="si" aria-hidden="true"><SparkIcon /></span>
            <span><b>{t('legal_news')}</b><small>{t('legal_news_sub', { v: APP_VERSION })}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          <p className="legal-version">{t('legal_version', { v: APP_VERSION })}</p>
        </section>
      </main>
    </>
  )
}

// Your name: one row at rest, an inline field while editing. Same dibs.name as onboarding.
// Saves on blur or Enter, Escape cancels.
function NameRow() {
  const { t } = useApp()
  const [name, setNameState] = useState(getName)
  const [draft, setDraft] = useState(null) // null = resting
  const input = useRef(null)
  const cancelled = useRef(false)
  const clearing = useRef(false) // the × was pressed: the blur it causes must not close the field

  const open = () => {
    if (draft !== null) return
    cancelled.current = false
    setDraft(name)
    // iOS only opens the keyboard for a focus made inside the tap itself: the input is always mounted
    // (invisible but focusable at rest, see .name-row in theme-dark.css), so focus it here, synchronously, then put the cursor at the end.
    const el = input.current
    if (el) {
      el.value = name
      el.focus()
      const end = el.value.length
      try { el.setSelectionRange(end, end) } catch { /* some input types refuse it */ }
    }
  }
  const finish = () => {
    if (clearing.current) return
    if (!cancelled.current) setNameState(setName(input.current?.value ?? draft ?? ''))
    cancelled.current = false
    setDraft(null)
  }
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.current?.blur() }
    if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; input.current?.blur() }
  }
  const clear = (e) => {
    e.stopPropagation()
    clearing.current = false
    setDraft('')
    input.current?.focus() // inside the tap, so the keyboard stays open
  }

  const editing = draft !== null
  return (
    <div className={`set-row name-row${editing ? ' editing' : ''}`} onClick={open}>
      <label htmlFor="set-name">{t('name_label')}</label>
      <div className="name-slot">
        {!editing && (
          <button type="button" className={`name-val${name ? '' : ' empty'}`}>
            <span>{name || t('prof_add_name')}</span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        )}
        <div className="name-edit">
          <input ref={input} id="set-name" type="text" autoComplete="given-name" autoCapitalize="words" enterKeyHint="done" maxLength={NAME_MAX}
            placeholder={t('name_placeholder')} value={draft ?? ''} tabIndex={editing ? 0 : -1}
            onChange={(e) => setDraft(e.target.value)} onBlur={finish} onKeyDown={onKey} />
          {editing && draft && (
            <button type="button" className="name-clear" aria-label={t('name_clear')} 
              onPointerDown={() => { clearing.current = true }} onPointerCancel={() => { clearing.current = false }} onMouseDown={(e) => e.preventDefault()} onClick={clear}>×</button>
          )}
        </div>
      </div>
    </div>
  )
}
