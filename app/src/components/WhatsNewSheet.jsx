import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../App.jsx'
import { Icon } from './ui.jsx'
import { playPop } from '../lib/sound.js'

// The big-update sheet (App.jsx shows it once when the app has moved to a newer release that carries a `sheet`, see
// lib/bigUpdate.js and lib/news.js). It is built on the app's bottom sheet (classes sheet-bg, sheet, sheet-grab) but
// composes them directly: it needs the grab to close, focus on "Got it", the 0.32 s slide and the pop on appear, which
// the plain Sheet does not provide. Reuses the Icon set as is. Display only: it reads nothing and sends nothing.
// Props: { release, entry, since, onClose, onGo, onSeeAll }. onClose, onGo and onSeeAll each save dibs.bigSeen in App.jsx.
const TILE_TONES = ['coral', 'mint', 'butter'] // row 1, 2, 3

// The entry's month and year in the app's language, like the dates in More > What's new (toLocaleDateString(lang, ...)).
const monthYear = (date, lang) => {
  try { return new Date(`${date}T12:00:00Z`).toLocaleDateString(lang, { month: 'long', year: 'numeric' }) } catch { return '' }
}

export default function WhatsNewSheet({ release, entry, since, onClose, onGo, onSeeAll }) {
  const { t, lang } = useApp()
  const okRef = useRef(null)
  const rows = Array.isArray(entry?.sheet) ? entry.sheet.slice(0, 3) : []

  // The pop on appear (respects the Sound setting inside playPop); focus "Got it"; Escape closes.
  useEffect(() => {
    playPop({ ifUnlocked: true })
    okRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="sheet-bg bigup-bg" onClick={onClose}>
      <div className="sheet bigup" role="dialog" aria-modal="true" aria-labelledby="bigup-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" onClick={onClose} aria-hidden="true" />
        <div className="bigup-head">
          <span className="bigup-pill">{`v${release}`}</span>
          <span className="bigup-when">{monthYear(entry?.date, lang)}</span>
        </div>
        <h2 id="bigup-title" className="bigup-title">{t('bigup_title', { v: release })}</h2>
        <div className="bigup-rows">
          {rows.map((row, i) => {
            const tone = TILE_TONES[i] || 'coral'
            const inner = (
              <>
                <span className={`bigup-tile ${tone}`} aria-hidden="true"><Icon name={row.icon} size={22} /></span>
                <span className="bigup-tx"><b>{t(row.title)}</b><small>{t(row.line)}</small></span>
                {row.go && <span className="bigup-show">{t('bigup_show')}<i aria-hidden="true">›</i></span>}
              </>
            )
            return row.go
              ? <button type="button" key={i} className="bigup-row go" onClick={() => onGo(row.go)}>{inner}</button>
              : <div key={i} className="bigup-row">{inner}</div>
          })}
        </div>
        {since && <p className="bigup-since">{t('bigup_since', { v: since })}</p>}
        <button type="button" ref={okRef} className="btn bigup-ok" onClick={onClose}>{t('bigup_ok')}</button>
        <button type="button" className="bigup-all" onClick={onSeeAll}>{t('bigup_all')}</button>
      </div>
    </div>,
    document.body,
  )
}
