// Copy diagnostics (More > Need help?): shows, as plain text, what Dibs sees on this phone, for support.
// Reads only. Opening the sheet and copying never writes a localStorage or sessionStorage key, never calls any
// send, deposit, unlock or pay function, and makes no request but the safe chain reads (balances and the staker).
// The heavy lifting is in lib/diagnostics.js: gather() reads through injected deps, buildDiagnostics() formats.
import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Sheet } from './ui.jsx'
import { config } from '../lib/config.js'
import { listAccountsWithBalance, readStaker } from '../lib/nimiq.js'
import { buildDiagnostics, gather } from '../lib/diagnostics.js'
import { copyText } from '../lib/clipboard.js'
import { APP_VERSION } from './LegalText.jsx'

// A page with a folded corner (document), the same mark as Terms in More.
const DocGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" />
  </svg>
)

// The button in the "Need help?" card, under the email pill, after a thin divider.
export function DiagnosticsButton() {
  const { t } = useApp()
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="diag-divider" aria-hidden="true" />
      <button type="button" className="diag-btn" onClick={() => setOpen(true)}>
        <span className="diag-ic" aria-hidden="true"><DocGlyph /></span>
        <span className="diag-btn-tx"><b>{t('diag_btn')}</b><small>{t('diag_btn_sub')}</small></span>
      </button>
      {open && <DiagnosticsSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function DiagnosticsSheet({ onClose }) {
  const { t, lang, address, demo, toast } = useApp()
  const [text, setText] = useState(null) // null = still reading

  useEffect(() => {
    let alive = true
    const now = Date.now()
    const tzOffsetMin = -new Date().getTimezoneOffset() // minutes east of UTC (positive for UTC+)
    const base = { now, tzOffsetMin, version: APP_VERSION, lang, demo, usedAddress: address, validatorAddress: config.defaultValidator }
    gather({ ...base, storage: window.localStorage, listAccounts: listAccountsWithBalance, readStaker })
      .then((state) => { if (alive) setText(buildDiagnostics(state)) })
      .catch(() => { if (alive) setText(buildDiagnostics({ ...base, accounts: 'error', staker: 'error', goalsShown: [], copies: [] })) })
    return () => { alive = false }
  }, [lang, demo, address])

  const copy = async () => {
    const ok = await copyText(text || '')
    toast(ok ? t('diag_copied') : t('diag_copy_fail'))
  }

  return (
    <Sheet title={t('diag_title')} onClose={onClose}>
      <p className="diag-sub">{t('diag_sub')}</p>
      <pre className="diag-box">{text == null ? t('diag_reading') : text}</pre>
      <button type="button" className="btn diag-copy" onClick={copy} disabled={text == null}>{t('diag_copy')}</button>
      <p className="diag-note">{t('diag_note')}</p>
    </Sheet>
  )
}
