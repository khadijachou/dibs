import { useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, LangSwitch } from '../components/ui.jsx'
import { NAME_MAX, getName, setName } from '../lib/name.js'
import { catalogBrands } from '../lib/brands.js'
import { NumbersCard, StatsSetting } from '../components/StatsConsent.jsx'

const FAQ = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const HELP_EMAIL = 'calldibs.contact@gmail.com'
const soundOn = () => { try { return localStorage.getItem('dibs.sound') !== 'off' } catch { return true } }

// Clipboard API first; the hidden textarea covers webviews where it is missing or refused.
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall back */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

// Four rounded squares (Browse the catalogue). A stroke icon: text glyphs turn into emoji on iOS.
const GridIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </svg>
)

export default function More() {
  const { t, go, showHowTo, toast } = useApp()
  const [sound, setSound] = useState(soundOn)

  const toggleSound = () => {
    const next = !sound
    try { localStorage.setItem('dibs.sound', next ? 'on' : 'off') } catch { /* private mode */ }
    setSound(next)
  }
  const copyEmail = async () => { if (await copyText(HELP_EMAIL)) toast(t('help_copied')) }

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
        </section>

        <section className="more-sec">
          <div className="sec-head"><h3>{t('more_faq')}</h3></div>
          {FAQ.map((n) => (
            <details key={n} className="faq">
              <summary>{`${n}. ${t(`faq_${n}q`)}`}</summary>
              <p>{t(`faq_${n}a`)}</p>
            </details>
          ))}
        </section>

        <section className="more-sec">
          <div className="sec-head"><h3>{t('more_settings')}</h3></div>
          <NameRow />
          <p className="small">{t('name_device')}</p>
          <div className="set-row"><span>{t('lang_label')}</span><LangSwitch /></div>
          <div className="set-row">
            <span>{t('more_sound')}</span>
            <button type="button" role="switch" aria-checked={sound} aria-label={t('more_sound')} className={`switch${sound ? ' on' : ''}`} onClick={toggleSound}><i /></button>
          </div>
          <StatsSetting />
        </section>

        <section className="help-card">
          <h3>{t('help_title')}</h3>
          <p>{t('help_body')}</p>
          <button type="button" className="help-email" aria-label={t('help_email')} onClick={copyEmail}>{HELP_EMAIL}</button>
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
