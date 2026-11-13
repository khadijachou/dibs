import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { itemLabel, localName } from '../lib/itemName.js'
import { BrandLogo, Header, Icon } from '../components/ui.jsx'
import { listGoals } from '../lib/goals.js'
import { boughtGoals } from '../lib/profileStats.js'
import { buildTimeline, shortHash } from '../lib/history.js'
import { fmtDate, fmtNim } from '../lib/format.js'
import { goalBrand } from './Home.jsx'
import { dayKey } from '../lib/xp.js'
import { BADGE, UNLOCK_TITLE, dayDeposits, fmtTime } from './historyView.js'

const EXPLORER = 'https://nimiq.watch/#'

export default function History({ focus }) {
  const { t, lang, address, toast, go } = useApp()
  // Home's "See all" opens History on Your cards.
  const cardsRef = useRef(null)
  useEffect(() => { if (focus === 'cards') cardsRef.current?.scrollIntoView({ block: 'start' }) }, [focus])
  const goals = listGoals(address)
  const goalById = new Map(goals.map((g) => [g.id, g]))
  // One row open at a time; a second tap on it closes it.
  const [openId, setOpenId] = useState(null)
  // Newest purchase first, like the timeline.
  const cards = boughtGoals(goals).sort((a, b) => String(b.payment?.at || b.createdAt).localeCompare(String(a.payment?.at || a.createdAt)))
  // Each row names the card in effect at its time; a card change row names both cards with their version.
  const cardName = (c) => `${itemLabel(t, c)}${c.region ? ` · ${t(`region_${c.region}`)}` : ''}`
  const events = buildTimeline(goals, (g) => itemLabel(t, g), (s) => localName(t, s, { title: true }), cardName)
  // Grouped by local day (the timeline is newest first): Today, Yesterday, else the date as the rows showed it.
  const today = dayKey(Date.now())
  const yesterday = dayKey(new Date().setDate(new Date().getDate() - 1))
  const days = []
  for (const e of events) {
    const k = dayKey(Date.parse(e.at))
    if (days.at(-1)?.key !== k) days.push({ key: k, at: e.at, events: [] })
    days.at(-1).events.push(e)
  }
  const dayLabel = (d) => (d.key === today ? t('hist_today') : d.key === yesterday ? t('hist_yesterday') : fmtDate(d.at, lang))

  const title = (e) => {
    if (e.type === 'deposit') return t('hist_deposit')
    if (e.type === 'move') return t('hist_move', { from: e.from, to: e.to })
    if (e.type === 'unlock') return t(UNLOCK_TITLE[e.step] || 'hist_unlock_started')
    if (e.type === 'withdraw') return t('hist_withdraw')
    if (e.type === 'change') return t('hist_card_changed')
    return t('hist_purchase')
  }
  // Tap the short hash to copy the full one. Nimiq transactions also link to the explorer; a purchase's hash is
  // the Lightning payment hash, not a Nimiq transaction, so it gets a label and no link.
  const copy = (h) => { navigator.clipboard?.writeText(h); toast(t('err_copied')) }
  // Taps inside the open details never reach the row (they are siblings, this is belt and braces).
  const keep = (ev) => ev.stopPropagation()

  // Closed row: logo (with the action badge), title and card, amount and time.
  const rowBody = (e) => {
    const g = goalById.get(e.goalId)
    return (
      <>
        <span className="tl-logo" aria-hidden="true">
          {g ? (
            <>
              <BrandLogo brand={goalBrand(g)} />
              <span className={`tl-badge ${e.type}`}>{e.type === 'change' ? <Icon name="swap" size={11} stroke={3} /> : BADGE[e.type]}</span>
            </>
          ) : <span className="tl-ic">{e.type === 'change' ? <Icon name="swap" size={20} stroke={3} /> : BADGE[e.type]}</span>}
        </span>
        <span className="tl-main">
          <b>{title(e)}</b>
          {e.type === 'change' ? <span className="tl-goal">{e.from} → {e.to}</span>
            : e.type !== 'move' && <span className="tl-goal">{e.goal}</span>}
        </span>
        <span className="tl-end">
          {e.type !== 'change' && <span className="tl-amt">{e.type === 'deposit' ? '+' : ''}{fmtNim(e.nim, lang)} NIM</span>}
          <span className="tl-time">{fmtTime(e.at, lang)}</span>
        </span>
      </>
    )
  }
  // Details under the text column: the hash chip (copies the full hash), then the explorer link. A purchase's hash is
  // the Lightning payment hash: a label and no link. A change has no transaction: its line says so.
  const details = (e) => (
    <div className="tl-details" id={`tl-d-${e.id}`}>
      {e.type === 'change' ? <span className="tl-meta">{t('hist_card_changed_meta')}</span> : (
        <>
          {e.type === 'purchase' && <span className="tl-meta">{t('hist_payment_ref')}</span>}
          <button type="button" className="tl-tx" aria-label={t('hist_copy_tx')} onClick={(ev) => { keep(ev); copy(e.tx) }}>
            {shortHash(e.tx)} · {t('hist_copy')}
          </button>
          {e.type !== 'purchase' && (
            <a className="tl-link" href={`${EXPLORER}${e.tx}`} target="_blank" rel="noopener noreferrer" onClick={keep}>
              {t('hist_view_tx')} <span aria-hidden="true">↗</span>
            </a>
          )}
        </>
      )}
    </div>
  )

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
          <div className="tl-days">
            {days.map((d) => {
              const added = dayDeposits(d.events)
              return (
                <section key={d.key} className="tl-day-sec">
                  <div className="tl-day-head">
                    <h3 className="tl-day">{dayLabel(d)}</h3>
                    {added > 0 && <span className="tl-day-sum">{t('hist_day_added', { nim: fmtNim(added, lang) })}</span>}
                  </div>
                  <ol className="timeline">
                    {d.events.map((e) => {
                      const openable = e.type === 'change' || !!e.tx
                      const open = openable && openId === e.id
                      return (
                        <li key={e.id} className={`tl-row ${e.type}${open ? ' open' : ''}`}>
                          {openable ? (
                            <button type="button" className="tl-btn" aria-expanded={open} aria-controls={open ? `tl-d-${e.id}` : undefined}
                              onClick={() => setOpenId(open ? null : e.id)}>
                              {rowBody(e)}
                            </button>
                          ) : <div className="tl-btn static">{rowBody(e)}</div>}
                          {open && details(e)}
                        </li>
                      )
                    })}
                  </ol>
                </section>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
