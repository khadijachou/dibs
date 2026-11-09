import { useEffect, useRef } from 'react'
import { useApp } from '../App.jsx'
import { itemLabel, localName } from '../lib/itemName.js'
import { BrandLogo, Header, Icon } from '../components/ui.jsx'
import { listGoals } from '../lib/goals.js'
import { boughtGoals } from '../lib/stats.js'
import { buildTimeline, shortHash } from '../lib/history.js'
import { fmtDate, fmtNim } from '../lib/format.js'
import { goalBrand } from './Home.jsx'

const ICON = { deposit: '+', move: '⇄', unlock: '↧', withdraw: '↩', purchase: '✓' }
const EXPLORER = 'https://nimiq.watch/#'
const STEP = { deactivate: 'unlock_s1', retire: 'unlock_s2', remove: 'unlock_s3' }

export default function History({ focus }) {
  const { t, lang, address, toast, go } = useApp()
  // Home's "See all" opens History on Your cards.
  const cardsRef = useRef(null)
  useEffect(() => { if (focus === 'cards') cardsRef.current?.scrollIntoView({ block: 'start' }) }, [focus])
  const goals = listGoals(address)
  // Newest purchase first, like the timeline.
  const cards = boughtGoals(goals).sort((a, b) => String(b.payment?.at || b.createdAt).localeCompare(String(a.payment?.at || a.createdAt)))
  const events = buildTimeline(goals, (g) => itemLabel(t, g), (s) => localName(t, s, { title: true }))

  const title = (e) => {
    if (e.type === 'deposit') return t('hist_deposit')
    if (e.type === 'move') return t('hist_move', { from: e.from, to: e.to })
    if (e.type === 'unlock') return t('hist_unlock', { step: t(STEP[e.step] || 'unlock_s1') })
    if (e.type === 'withdraw') return t('hist_withdraw')
    return t('hist_purchase')
  }
  // Tap the short hash to copy the full one. Nimiq transactions also link to the explorer; a purchase's hash is
  // the Lightning payment hash, not a Nimiq transaction, so it gets a label and no link.
  const copy = (h) => { navigator.clipboard?.writeText(h); toast(t('err_copied')) }

  return (
    <>
      <Header />
      <main className="screen">
        <h2 className="title">{t('tab_history')}</h2>

        <section className="more-sec hist-cards" ref={cardsRef}>
          <div className="sec-head"><h3>{t('hist_cards')}</h3></div>
          {cards.length === 0 ? (
            <p className="small">{t('hist_cards_empty')}</p>
          ) : cards.map((g) => (
            <button type="button" key={g.id} className="past" onClick={() => go('done', { goalId: g.id, mode: 'details' })}>
              <BrandLogo brand={goalBrand(g)} />
              <div><b>{itemLabel(t, g)}</b><span className="s">{fmtDate(g.payment?.at || g.createdAt, lang)}</span></div>
              <span className="code">{t('home_code')}</span>
            </button>
          ))}
        </section>

        {events.length === 0 ? (
          <section className="hist-empty">
            <span className="hist-empty-ic" aria-hidden="true"><Icon name="tabHistory" size={28} /></span>
            <b>{t('hist_empty_title')}</b>
            <p>{t('hist_empty_body')}</p>
          </section>
        ) : (
          <ol className="timeline">
            {events.map((e) => (
              <li key={e.id} className={`tl-row ${e.type}`}>
                <span className="tl-ic" aria-hidden="true">{ICON[e.type]}</span>
                <div className="tl-main">
                  <b>{title(e)}</b>
                  {e.type !== 'move' && <span className="tl-goal">{e.goal}</span>}
                  <span className="tl-meta">
                    {fmtDate(e.at, lang)}
                    {e.tx && e.type === 'purchase' && <span>{t('hist_payment_ref')}</span>}
                    {e.tx && <button type="button" className="tl-tx" aria-label={t('hist_copy_tx')} onClick={() => copy(e.tx)}>{shortHash(e.tx)}</button>}
                    {e.tx && e.type !== 'purchase' && <a className="tl-link" href={`${EXPLORER}${e.tx}`} target="_blank" rel="noopener noreferrer">{t('hist_view_tx')}</a>}
                  </span>
                </div>
                <span className="tl-amt">{e.type === 'deposit' ? '+' : ''}{fmtNim(e.nim, lang)} NIM</span>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  )
}
