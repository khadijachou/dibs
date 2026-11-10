// Usage stats UI (Round 2E): the consent step, the one-time Goals card, the Settings row and the More numbers card.
// Nothing is sent until the user taps Share stats (lib/stats.js). No pre-ticked choice anywhere.
import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { LangSwitch, Sheet, Wordmark } from './ui.jsx'
import { consent, deleteShared, numbersPageUrl, publicNumbers, setConsent } from '../lib/stats.js'
import { fmtNim } from '../lib/format.js'

export const ShieldCheck = ({ size = 34 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /><path d="M8.8 12.2l2.2 2.2 4.2-4.4" />
  </svg>
)
const Check = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
const Cross = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
)

// Onboarding, after the name step. No tab bar.
export function ConsentStep({ onDone }) {
  const { t } = useApp()
  const answer = (v) => { setConsent(v); onDone() }
  return (
    <div className="app">
      <header className="header ob-top">
        <div className="grow"><Wordmark cream /></div>
        <LangSwitch />
      </header>
      <main className="screen ob consent">
        <div className="consent-ring"><ShieldCheck /></div>
        <h1 className="ob-title">{t('stats_title')}</h1>
        <p className="ob-sub">{t('stats_body')}</p>
        <section className="consent-card">
          <h2 className="ch c-yes">{t('stats_shared_h')}</h2>
          <p className="cl c-yes"><Check />{t('stats_item_goals')}</p>
          <p className="cl c-yes"><Check />{t('stats_item_nim')}</p>
          <p className="cl c-yes"><Check />{t('stats_item_cards')}</p>
          <h2 className="ch c-no">{t('stats_never_h')}</h2>
          <p className="cl c-no"><Cross />{t('stats_never')}</p>
        </section>
        <p className="consent-note">{t('stats_how')}</p>
        <p className="consent-note">{t('stats_later')}</p>
        <div className="bottom consent-btns">
          <button type="button" className="btn" onClick={() => answer('yes')}>{t('stats_yes')}</button>
          <button type="button" className="btn ghost" onClick={() => answer('no')}>{t('stats_no')}</button>
        </div>
      </main>
    </div>
  )
}

// Goals tab, once, for users who finished onboarding before this step existed. Gone after either answer.
export function StatsCard() {
  const { t } = useApp()
  const [asked, setAsked] = useState(() => consent() !== null)
  if (asked) return null
  const answer = (v) => { setConsent(v); setAsked(true) }
  return (
    <section className="stats-card">
      <div className="sc-head"><span className="sc-icon"><ShieldCheck size={20} /></span><b>{t('stats_title')}</b></div>
      <p>{t('stats_card_body')}</p>
      <div className="sc-btns">
        <button type="button" className="btn small" onClick={() => answer('yes')}>{t('stats_yes')}</button>
        <button type="button" className="btn small ghost" onClick={() => answer('no')}>{t('stats_no')}</button>
      </div>
    </section>
  )
}

// More > Settings: the switch (on = yes, off = no from now on) and Delete what was shared.
export function StatsSetting() {
  const { t, toast } = useApp()
  const [on, setOn] = useState(() => consent() === 'yes')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const toggle = () => { const next = !on; setConsent(next ? 'yes' : 'no'); setOn(next) }
  const del = async () => {
    setBusy(true)
    const ok = await deleteShared()
    setBusy(false)
    setConfirm(false)
    if (ok) { setOn(false); toast(t('stats_deleted')) } else toast(t('stats_delete_fail'))
  }
  return (
    <>
      <div className="set-row stats-row">
        <span><b>{t('stats_setting')}</b><small>{t('stats_setting_sub')}</small></span>
        <button type="button" role="switch" aria-checked={on} aria-label={t('stats_setting')} className={`switch${on ? ' on' : ''}`} onClick={toggle}><i /></button>
      </div>
      <button type="button" className="stats-delete" onClick={() => setConfirm(true)}>{t('stats_delete')}</button>
      {confirm && (
        <Sheet title={t('stats_delete')} onClose={() => !busy && setConfirm(false)}>
          <p className="small">{t('stats_delete_confirm')}</p>
          <button type="button" className="btn danger" disabled={busy} onClick={del}>{t('stats_delete_cta')}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>{t('manage_cancel')}</button>
        </Sheet>
      )}
    </>
  )
}

// More, first card: the public totals. Hidden while loading and when the server cannot be reached.
export function NumbersCard() {
  const { t, lang } = useApp()
  const [n, setN] = useState(null)
  useEffect(() => {
    let live = true
    publicNumbers().then((d) => { if (live && d && typeof d.people === 'number') setN(d) })
    return () => { live = false }
  }, [])
  if (!n) return null
  const num = (v) => fmtNim(Math.round(v || 0), lang)
  return (
    <section className="numbers-card">
      <div className="nc-head">
        <h3>{t('numbers_title')}</h3>
        <span className="nc-live"><i aria-hidden="true" />{t('numbers_live')}</span>
      </div>
      <div className="nc-grid">
        <div><b>{num(n.people)}</b><span>{t('numbers_people')}</span></div>
        <div><b>{num(n.savers)}</b><span>{t('numbers_savers')}</span></div>
        <div><b className="mint">{num(n.nimAddedVerified)}</b><span>{t('stats_item_nim')}</span></div>
        <div><b className="butter">{num(n.cardsBought)}</b><span>{t('stats_item_cards')}</span></div>
      </div>
      <a className="nc-all" href={numbersPageUrl()} target="_blank" rel="noopener noreferrer">{t('see_all')} ›</a>
    </section>
  )
}
