import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { listGoals, savedNim } from '../lib/goals.js'
import { findItem } from '../lib/catalog.js'
import { freeNimOf } from '../lib/readyState.js'
import { cardToday, fmtChange, fmtPctChange } from '../lib/cardToday.js'
import { getRate7d } from '../lib/rate7d.js'
import { fmtNim } from '../lib/format.js'
import { Icon } from './ui.jsx'
import { readWallet } from './ReadyState.jsx'

// What the goal's card costs today (lib/cardToday.js). The wallet as useReady reads it (readWallet, the header
// balance standing in); the rate 7 days ago only for a saving goal on screen (lib/rate7d.js, once a day). Read only.
export function useCardToday(goal) {
  const { address, balance, prices } = useApp()
  const [wallet, setWallet] = useState(null)
  const [rate7d, setRate7d] = useState(null)
  const has = Boolean(goal)
  const saving = goal?.status === 'saving'
  useEffect(() => {
    if (!has) return undefined
    let live = true
    readWallet().then((n) => { if (live && n != null) setWallet(n) })
    return () => { live = false }
  }, [has, balance])
  useEffect(() => {
    if (!saving) return undefined
    let live = true
    getRate7d().then((r) => { if (live) setRate7d(r) })
    return () => { live = false }
  }, [saving])
  if (!goal) return null
  const free = freeNimOf(wallet ?? balance, listGoals(address))
  return cardToday(goal, findItem(goal.itemId), prices, { free, rate7d })
}

const Change = ({ n, pct, lang }) => (
  <span className="ct-val">{fmtChange(n, lang)} NIM <span className="ct-pct">{fmtPctChange(pct, lang)}</span></span>
)

// Goal page, saving goals only: under 100 % the price today and how it moved; at 100 % what is missing, if anything.
export function CardTodayBlock({ goal, onAdd }) {
  const { t, lang } = useApp()
  const ct = useCardToday(goal)
  if (!ct || goal.status !== 'saving') return null
  const reached = savedNim(goal) >= goal.targetNim
  if (!ct.live) {
    if (reached || ct.planNim == null) return null
    return (
      <section className="card ct">
        <div className="ct-row"><span className="ct-label">{t('ct_plan_price')}</span><span className="ct-val">{fmtNim(ct.planNim, lang)} NIM</span></div>
        <p className="ct-foot">{t('ct_no_rate')}</p>
      </section>
    )
  }
  if (!reached) {
    return (
      <section className="card ct">
        <div className="ct-row"><span className="ct-label">{t('ct_title')}</span><span className="ct-val">{t('ct_about', { n: fmtNim(ct.price, lang) })}</span></div>
        {ct.since != null && <div className="ct-row"><span className="ct-sub">{t('ct_since')}</span><Change n={ct.since} pct={ct.sincePct} lang={lang} /></div>}
        {ct.d7 != null && <div className="ct-row"><span className="ct-sub">{t('ct_d7')}</span><Change n={ct.d7} pct={ct.d7Pct} lang={lang} /></div>}
        <p className="ct-foot">{t('ct_estimate')}</p>
      </section>
    )
  }
  const moved = ct.kind === 'covered' || ct.since == null || ct.since === 0 ? ''
    : ct.since > 0 ? t('ct_more', { n: fmtNim(ct.since, lang) })
    : ct.gap > 0 ? t('ct_less', { n: fmtNim(-ct.since, lang) }) : ''
  const text = ct.kind === 'covered' ? t('ct_text_covered')
    : [moved, ct.kind === 'wallet' ? t('ct_text_wallet', { free: fmtNim(ct.free, lang) })
      : ct.kind === 'short' ? t('ct_text_short', { free: fmtNim(ct.free, lang), add: fmtNim(ct.toAdd, lang) }) : ''].filter(Boolean).join(' ')
  return (
    <section className="card ct">
      <div className="ct-row"><span className="ct-sub">{t('ct_price_today')}</span><span className="ct-val">{t('ct_about', { n: fmtNim(ct.price, lang) })}</span></div>
      <div className="ct-row"><span className="ct-sub">{t('ct_saved')}</span><span className="ct-val">{fmtNim(ct.saved, lang)} NIM</span></div>
      <div className="ct-line" />
      {ct.gap > 0
        ? <div className="ct-row"><span className="ct-label">{t('ct_missing')}</span><span className="ct-val ct-missing">{t('ct_about', { n: fmtNim(ct.gap, lang) })}</span></div>
        : <div className="ct-row"><span className="ct-covered"><Icon name="check" size={16} />{t('ct_covered')}</span></div>}
      {text && <p className="ct-text">{text}</p>}
      {ct.gap > 0 && <button type="button" className="ct-add" onClick={() => onAdd(ct.gap)}>{t('ct_add_first', { n: fmtNim(ct.gap, lang) })}</button>}
      <p className="ct-foot">{t('ct_estimate')}</p>
    </section>
  )
}

// Unlock page, before step 1: the card costs more today than the goal saved. Never blocks the unlock.
export function UnlockGapBand({ goal, onAdd }) {
  const { t, lang } = useApp()
  const ct = useCardToday(goal)
  if (goal?.status !== 'saving' || !ct?.live || !(ct.gap > 0)) return null // saving only: Add NIM opens on saving goals
  return (
    <div className="ct-band" role="status">
      <p>{t('ct_unlock_band', { price: fmtNim(ct.price, lang), saved: fmtNim(ct.saved, lang), gap: fmtNim(ct.gap, lang) })}</p>
      <button type="button" className="ct-link" onClick={() => onAdd(ct.gap)}>{t('ct_unlock_link')}</button>
    </div>
  )
}
