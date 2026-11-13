import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { itemLabel } from '../lib/itemName.js'
import { BrandLogo, Header, Notice, useFiat } from '../components/ui.jsx'
import { brandOf, brandRegion, catalogBrands } from '../lib/brands.js'
import { findItem } from '../lib/catalog.js'
import { cardTakenBy, createGoal, getGoal, listGoals, openGoalFor, savedNim, updateGoal } from '../lib/goals.js'
import { cardChangePatch, payLockedFor } from '../lib/availability.js'
import { usdToNim } from '../lib/price.js'
import { targetUsdOf } from '../lib/readyState.js'
import { poolName } from '../lib/pace.js'
import { playPop } from '../lib/sound.js'
import Num from '../components/Num.jsx'
import { addDays, fmtDate, fmtNim, fmtUsd } from '../lib/format.js'
import { fmtFiatValue } from '../lib/fiatValue.js'
import { useCountUp } from '../lib/useCountUp.js'
import { track } from '../lib/stats.js'
import { getUnlockState } from '../lib/unlockFlow.js'
import { duplicateMessage, duplicateText, needsChainRead } from '../lib/duplicate.js'
import { useDuplicateText } from '../components/useDuplicateText.js'
import { readyTimeText } from '../components/ReleaseClock.jsx'
import { fmtCompact, minsSince, pickPlanItem, planWeeks, timelineDots, walletPct } from './planView.js'

// The two rows of the facts card (v1.0.9): a rising line with an arrow (earning) and a clock (the wait).
const GrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" />
  </svg>
)
const ClockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
)
const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.5h.01" />
  </svg>
)

// BUG-17: targetUsdOf (lib/readyState.js) adds a 10 % safety margin to an item with no live shop quote. Ready goals
// use the same rule for today's price.

// "add about **4,273 NIM** a week" -> text with the ** parts in <b>. Text nodes only, never HTML.
const Bold = ({ text }) => text.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))

const OPTIONS = [
  { key: 'plan_w2', days: 14 },
  { key: 'plan_m2', days: 61 },
  { key: 'plan_m6', days: 183 },
]

// v1.1.8: one timeline for every option (screens/planView.js timelineDots): a coral Today dot, one grey dot per week
// (12 weeks or less) or per month, a mint deadline dot. WeekDots (Goal) is not used here any more.
function PlanTimeline({ days, left, right }) {
  const { count } = timelineDots(days)
  const parts = []
  for (let i = 0; i < count; i++) {
    parts.push(<i key={`d${i}`} className={`ptl-d${i === 0 ? ' today' : i === count - 1 ? ' end' : ''}`} />)
    if (i < count - 1) parts.push(<i key={`l${i}`} className="ptl-ln" />)
  }
  return (
    <div className="ptl">
      <div className="ptl-dots" aria-hidden="true">{parts}</div>
      <div className="ptl-lab"><span>{left}</span><span>{right}</span></div>
    </div>
  )
}

// Accepts { brandKey, region, itemId } (region and value picked on the brand sheet), { brandKey, region } (first value)
// or the old { itemId }. The value is not picked here any more: Back goes to the sheet's catalogue.
// changeFor: swap this goal's card instead of creating a goal (its card is no longer available). The goal keeps its
// deposits, saved NIM, deadline and history; only the card and the target (today's price) change. No transaction.
export default function Plan({ brandKey, region = null, itemId, moveFrom = null, changeFor = null }) {
  const { t, lang, address, balance, prices, back, reset, toast } = useApp()
  const fiat = useFiat()
  const changing = changeFor ? getGoal(address, changeFor) : null
  const fromItem = itemId ? findItem(itemId) : null
  const key = brandKey || brandOf(fromItem)?.key
  const brand = catalogBrands().find((b) => b.key === key)
  const version = brand ? brandRegion(brand, region || fromItem?.region) : null
  const amounts = version ? version.items : fromItem ? [fromItem] : []
  // The sheet's value when it is one of this version's values (still sold); else the first value, as before.
  const { item, found } = pickPlanItem(amounts, itemId)
  const [days, setDays] = useState(61)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id) }, [])
  useEffect(() => { if (!found) console.warn('[plan] itemId not in this version, first value used', itemId) }, [found, itemId])

  // One open goal per card: Change card never moves a goal onto a card another open goal already has.
  const taken = changing && item ? cardTakenBy(listGoals(address), item.id, changing.id) : null
  const takenText = useDuplicateText('change', taken)
  // Display only: null until prices load, so the first real target appears without counting from 0.
  const targetShown = useCountUp(item && prices ? usdToNim(targetUsdOf(item), prices.nimUsd) : null)
  if (!item) return null
  if (!prices) {
    return <><Header onBack={back} /><main className="screen"><p className="sub">{t('loading')}</p></main></>
  }

  const estimated = item.live === false
  const targetNim = usdToNim(targetUsdOf(item), prices.nimUsd)
  const deadline = addDays(days)
  const weeks = planWeeks(days)
  const weekly = Math.ceil(targetNim / weeks)
  const mins = minsSince(prices.at, now)
  const ago = mins == null ? null : mins < 1 ? t('ago_now') : t('ago_min', { n: mins })
  const pct = walletPct(balance, targetNim)
  const weeklyFiat = fmtFiatValue(weekly, fiat, lang)
  const b = brand || brandOf(item)
  const regionKey = item.region || version?.key || null

  const switchCard = () => {
    const g = getGoal(address, changing.id)
    if (!g || payLockedFor(g.id) || cardTakenBy(listGoals(address), item.id, g.id)) return
    updateGoal(address, g.id, cardChangePatch(g, { item, targetNim, brand: b, nimUsd: prices.nimUsd }))
    toast(t('change_done'))
    reset('goal', { goalId: g.id })
  }

  const create = () => {
    // One open goal per card (10 Nov: a goal created again after a reinstall sat next to the recovered one at 0 %).
    const existing = openGoalFor(listGoals(address), item.id)
    if (existing) {
      reset('goal', { goalId: existing.id })
      // The message follows that goal's unlock on the chain; unreadable chain: the plain message.
      const say = (us) => toast(duplicateText(t, existing, duplicateMessage('new', existing, us), (ms) => readyTimeText(ms, lang)))
      if (needsChainRead(existing)) getUnlockState(existing, address).then(say, () => say(null)); else say(null)
      return
    }
    playPop() // the Dibs! stamp, from this tap
    const goal = createGoal(address, { item, targetNim, deadline, brand: b, nimUsd: prices.nimUsd })
    track('goal_created', { goalId: goal.id, brand: b?.key || undefined, itemId: item.id, usd: item.usd, weeks })
    reset('goal', { goalId: goal.id, created: true, moveFrom })
  }

  const tipVars = { amount: fmtNim(weekly, lang), date: fmtDate(deadline, lang) }
  const tip = weeklyFiat ? t('plan_tip', { ...tipVars, fiat: weeklyFiat }) : t('plan_tip_nofiat', tipVars)

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <div className="plan-head">
          <BrandLogo brand={b} />
          <div>
            <p className="small">{t(changing ? 'change_label' : 'plan_label')}</p>
            <h2 className="title">{itemLabel(t, item)}</h2>
          </div>
        </div>
        <div className="plan-meta">
          <div><span>{t('about_region')}</span><b>{regionKey ? t(`region_${regionKey}`) : '-'}</b></div>
          <div><span>{t('about_delivered')}</span><b>{b?.delivers ? t(`delivers_${b.delivers}`) : '-'}</b></div>
        </div>
        <section className="plan-target">
          <span className="pt-label">{t('plan_target3')}</span>
          <div className="pt-num"><Num value={fmtNim(Math.round(targetShown), lang)} /><small>NIM</small></div>
          {estimated && <span className="pt-margin">{t('plan_margin_chip')}</span>}
          <dl className="pt-rows">
            <div><dt>{t('plan_row_price')}</dt><dd>{estimated ? '≈ ' : ''}{fmtUsd(item.usd, lang)} USD</dd></div>
            <div><dt>{t('plan_row_rate')}</dt><dd>{t('plan_rate_val', { rate: fmtUsd(prices.nimUsd, lang) })}</dd></div>
            {pct != null && (
              <div><dt>{t('plan_row_wallet')}</dt><dd>{fmtNim(balance, lang)} NIM · <span className="pt-pct">{pct}%</span></dd></div>
            )}
            {prices.live ? (
              ago && <div><dt>{t('plan_row_updated')}</dt><dd><i className="pt-dot" aria-hidden="true" />{ago}</dd></div>
            ) : (
              <div><dt>{t('plan_row_updated')}</dt><dd className="off"><i className="pt-dot off" aria-hidden="true" />{t('plan_rate_off3')}</dd></div>
            )}
          </dl>
        </section>
        <p className="plan-source"><InfoIcon />{t('plan_source')}</p>
        {changing ? (
          <div className="hint">{t('change_summary', { saved: fmtNim(savedNim(changing), lang), target: fmtNim(targetNim, lang) })}</div>
        ) : (
          <section className="card">
            <span className="plan-label">{t('plan_by')}</span>
            <div className="pills plan-opts" role="group" aria-label={t('plan_by')}>
              {OPTIONS.map((o) => {
                const w = Math.ceil(targetNim / planWeeks(o.days))
                return (
                  <button type="button" key={o.key} className={`pill tall${o.days === days ? ' on' : ''}`} aria-pressed={o.days === days} onClick={() => setDays(o.days)}>
                    {t(o.key)}<small>{t('plan_opt_week', { amount: fmtCompact(w, lang) })}</small>
                  </button>
                )
              })}
            </div>
            <PlanTimeline days={days} left={t('plan_today')} right={fmtDate(deadline, lang)} />
            <div className="hint"><Bold text={tip} /></div>
          </section>
        )}
        {/* v1.0.9: one card, two rows (earning, then the wait). Own class names: .facts/.fact stay as they are on Done. */}
        <div className="plan-facts">
          <div className="pf-row">
            <span className="pf-ico grow" aria-hidden="true"><GrowIcon /></span>
            <div><b>{t('plan_earns_t')}</b><span>{t('plan_earns_b', { validator: poolName() })}</span></div>
          </div>
          <div className="pf-row">
            <span className="pf-ico wait" aria-hidden="true"><ClockIcon /></span>
            <div><b>{t('plan_wait_t', { min: 12, max: 24 })}</b><span>{t('plan_wait_b')}</span></div>
          </div>
        </div>
        <div className="bottom">
          {changing && taken && (
            <Notice tone="info" title={takenText} actions={[{ label: t('change_exists_open'), onClick: () => reset('goal', { goalId: taken.id }) }]} />
          )}
          {changing
            ? <button type="button" className="btn tall" disabled={Boolean(taken)} onClick={switchCard}>{t('change_cta')}<small>{t('change_cta_sub')}</small></button>
            : <button type="button" className="btn" onClick={create}>{t('plan_create')}</button>}
        </div>
      </main>
    </>
  )
}
