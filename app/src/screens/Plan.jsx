import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { detailText, isAmountDetail, itemName } from '../lib/itemName.js'
import { BrandLogo, Header, WeekDots } from '../components/ui.jsx'
import { brandOf, catalogBrands, pickAmounts } from '../lib/brands.js'
import { findItem } from '../lib/catalog.js'
import { createGoal, getGoal, savedNim, updateGoal } from '../lib/goals.js'
import { cardChangePatch, payLockedFor } from '../lib/availability.js'
import { usdToNim } from '../lib/price.js'
import { poolName } from '../lib/pace.js'
import { playPop } from '../lib/sound.js'
import { addDays, fmtDate, fmtNim, fmtUsd } from '../lib/format.js'
import { useCountUp } from '../lib/useCountUp.js'

// BUG-17: an item with live: false has no shop quote; its usd is the catalogue's stored placeholder.
// Its target gets a 10 % safety margin so the user does not fall short when the shop confirms the price.
const SAFETY_MARGIN = 0.1
const targetUsdOf = (item) => (item.live === false ? item.usd * (1 + SAFETY_MARGIN) : item.usd)

// "add about **4,273 NIM** a week" -> text with the ** parts in <b>. Text nodes only, never HTML.
const Bold = ({ text }) => text.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))

const OPTIONS = [
  { key: 'plan_w2', days: 14 },
  { key: 'plan_m2', days: 61 },
  { key: 'plan_m6', days: 183 },
]

// Accepts { brandKey } (v2.2) or the old { itemId }.
// changeFor: swap this goal's card instead of creating a goal (its card is no longer available). The goal keeps its
// deposits, saved NIM, deadline and history; only the card and the target (today's price) change. No transaction.
export default function Plan({ brandKey, itemId, moveFrom = null, changeFor = null }) {
  const { t, lang, address, prices, back, reset, toast } = useApp()
  const changing = changeFor ? getGoal(address, changeFor) : null
  const fromItem = itemId ? findItem(itemId) : null
  const key = brandKey || brandOf(fromItem)?.key
  const brand = catalogBrands().find((b) => b.key === key)
  const amounts = brand ? pickAmounts(brand.items) : fromItem ? [fromItem] : []
  const [pickedId, setPickedId] = useState(itemId || amounts[0]?.id)
  const [days, setDays] = useState(61)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id) }, [])

  const item = amounts.find((i) => i.id === pickedId) || amounts[0]
  // Display only: null until prices load, so the first real target appears without counting from 0.
  const targetShown = useCountUp(item && prices ? usdToNim(targetUsdOf(item), prices.nimUsd) : null)
  if (!item) return null
  if (!prices) {
    return <><Header onBack={back} /><main className="screen"><p className="sub">{t('loading')}</p></main></>
  }

  const estimated = item.live === false
  const targetNim = usdToNim(targetUsdOf(item), prices.nimUsd)
  const deadline = addDays(days)
  const weeks = Math.max(1, Math.ceil(days / 7))
  const weekly = Math.ceil(targetNim / weeks)
  const mins = Math.floor((now - (prices.at || now)) / 60000)
  const ago = mins < 1 ? t('ago_now') : t('ago_min', { n: mins })
  const b = brand || brandOf(item)

  const switchCard = () => {
    const g = getGoal(address, changing.id)
    if (!g || payLockedFor(g.id)) return
    updateGoal(address, g.id, cardChangePatch(g, { item, targetNim, brand: b, nimUsd: prices.nimUsd }))
    toast(t('change_done'))
    reset('goal', { goalId: g.id })
  }

  const create = () => {
    playPop() // the Dibs! stamp, from this tap
    const goal = createGoal(address, { item, targetNim, deadline, brand: b, nimUsd: prices.nimUsd })
    reset('goal', { goalId: goal.id, created: true, moveFrom })
  }

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <div className="plan-head">
          <BrandLogo brand={b} />
          <div>
            <p className="small">{t(changing ? 'change_label' : 'plan_label')}</p>
            <h2 className="title">{itemName(t, item, { title: true })}</h2>
          </div>
        </div>
        <section className="card">
          {amounts.length > 1 && (
            <>
              <span className="plan-label">{t('plan_card_value')}</span>
              <div className="pills" role="group" aria-label={t('plan_card_value')}>
                {amounts.map((a) => (
                  <button type="button" key={a.id} className={`pill tall${a.id === item.id ? ' on' : ''}`} aria-pressed={a.id === item.id} onClick={() => setPickedId(a.id)}>
                    {detailText(t, a, { short: true })}<small>{t('plan_you_pay', { price: (a.live === false ? '≈ ' : '') + fmtUsd(a.usd, lang) })}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="small plan-note">{amounts.length > 1 ? t('plan_price_note') : estimated ? `${t('price_checkout')}.` : !isAmountDetail(item) ? `${detailText(t, item)}. ${t('plan_price_note')}` : `${t('plan_price', { usd: fmtUsd(item.usd, lang) })}. ${t('plan_price_note')}`}</p>
          <div>
            <span className="plan-label target">{t('plan_target2')}</span>
            <div className="target-num" style={{ margin: '4px 0 6px' }}>{fmtNim(Math.round(targetShown), lang)} NIM</div>
            {estimated && <p className="plan-margin">{t('price_checkout')} · {t('plan_margin')}</p>}
            <div className={`rate${prices.live ? '' : ' off'}`}>
              <span>{t('plan_rate_val', { rate: fmtUsd(prices.nimUsd, lang) })}</span>
              <span className="rate-ago">{' · '}{prices.live ? t('plan_rate_ago', { ago }) : t('plan_rate_off3')}</span>
            </div>
            <p className="small plan-note">{t('plan_target_note')}</p>
          </div>
          {changing ? (
            <div className="hint">{t('change_summary', { saved: fmtNim(savedNim(changing), lang), target: fmtNim(targetNim, lang) })}</div>
          ) : (<>
          <span className="plan-label">{t('plan_by')}</span>
          <div className="pills" role="group" aria-label={t('plan_by')}>
            {OPTIONS.map((o) => (
              <button type="button" key={o.key} className={`pill${o.days === days ? ' on' : ''}`} aria-pressed={o.days === days} onClick={() => setDays(o.days)}>{t(o.key)}</button>
            ))}
          </div>
          <WeekDots total={weeks} planMode left={t('plan_today')} right={fmtDate(deadline, lang)} />
          <p className="small center" style={{ marginTop: -6 }}>{t('plan_weeks_each', { weeks, amount: fmtNim(weekly, lang) })}</p>
          <div className="hint"><Bold text={t('plan_suggest2', { amount: fmtNim(weekly, lang), date: fmtDate(deadline, lang) })} /></div>
          </>)}
        </section>
        <div className="facts">
          <div className="fact"><b className="dot">{t('plan_earns_t')}</b>{t('plan_earns_b', { validator: poolName() })}</div>
          <div className="fact"><b className="dot red">{t('plan_wait_t', { min: 12, max: 24 })}</b>{t('plan_wait_b')}</div>
        </div>
        <div className="bottom">
          {changing
            ? <button type="button" className="btn tall" onClick={switchCard}>{t('change_cta')}<small>{t('change_cta_sub')}</small></button>
            : <button type="button" className="btn" onClick={create}>{t('plan_create')}</button>}
        </div>
      </main>
    </>
  )
}
