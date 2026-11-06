import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header, WeekDots } from '../components/ui.jsx'
import { brandOf, catalogBrands, pickAmounts } from '../lib/brands.js'
import { findItem } from '../lib/catalog.js'
import { createGoal } from '../lib/goals.js'
import { usdToNim } from '../lib/price.js'
import { addDays, fmtDate, fmtNim, fmtUsd } from '../lib/format.js'

const OPTIONS = [
  { key: 'plan_w2', days: 14 },
  { key: 'plan_m2', days: 61 },
  { key: 'plan_m6', days: 183 },
]

// Accepts { brandKey } (v2.2) or the old { itemId }.
export default function Plan({ brandKey, itemId }) {
  const { t, lang, address, prices, back, reset } = useApp()
  const fromItem = itemId ? findItem(itemId) : null
  const key = brandKey || brandOf(fromItem)?.key
  const brand = catalogBrands().find((b) => b.key === key)
  const amounts = brand ? pickAmounts(brand.items) : fromItem ? [fromItem] : []
  const [pickedId, setPickedId] = useState(itemId || amounts[0]?.id)
  const [days, setDays] = useState(61)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id) }, [])

  const item = amounts.find((i) => i.id === pickedId) || amounts[0]
  if (!item) return null
  if (!prices) {
    return <><Header onBack={back} /><main className="screen"><p className="sub">{t('loading')}</p></main></>
  }

  const targetNim = usdToNim(item.usd, prices.nimUsd)
  const deadline = addDays(days)
  const weeks = Math.max(1, Math.ceil(days / 7))
  const weekly = Math.ceil(targetNim / weeks)
  const mins = Math.floor((now - (prices.at || now)) / 60000)
  const ago = mins < 1 ? t('ago_now') : t('ago_min', { n: mins })
  const b = brand || brandOf(item)

  const create = () => {
    const goal = createGoal(address, { item, targetNim, deadline, brand: b, nimUsd: prices.nimUsd })
    reset('goal', { goalId: goal.id, created: true })
  }

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <div className="plan-head">
          <BrandLogo brand={b} />
          <div>
            <p className="small">{t('plan_label')}</p>
            <h2 className="title">{item.name}</h2>
          </div>
        </div>
        <section className="card">
          {amounts.length > 1 && (
            <>
              <span className="small">{t('plan_card_value')}</span>
              <div className="pills" role="group" aria-label={t('plan_card_value')}>
                {amounts.map((a) => (
                  <button type="button" key={a.id} className={`pill tall${a.id === item.id ? ' on' : ''}`} aria-pressed={a.id === item.id} onClick={() => setPickedId(a.id)}>
                    {a.detail}<small>{t('plan_you_pay', { price: fmtUsd(a.usd, lang) })}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          <div>
            <span className="small">{t('plan_target2')}</span>
            <div className="target-num" style={{ margin: '4px 0 6px' }}>{fmtNim(targetNim, lang)} NIM</div>
            <div className={`rate${prices.live ? '' : ' off'}`}>
              {t(prices.live ? 'plan_rate_live' : 'plan_rate_off2', { rate: fmtUsd(prices.nimUsd, lang), ago })}
            </div>
          </div>
          <span className="small">{t('plan_by')}</span>
          <div className="pills" role="group" aria-label={t('plan_by')}>
            {OPTIONS.map((o) => (
              <button type="button" key={o.key} className={`pill${o.days === days ? ' on' : ''}`} aria-pressed={o.days === days} onClick={() => setDays(o.days)}>{t(o.key)}</button>
            ))}
          </div>
          <WeekDots total={weeks} planMode left={t('plan_today')} right={fmtDate(deadline, lang)} />
          <p className="small center" style={{ marginTop: -6 }}>{t('plan_weeks_each', { weeks, amount: fmtNim(weekly, lang) })}</p>
          <div className="hint">{t('plan_suggest2', { amount: fmtNim(weekly, lang), date: fmtDate(deadline, lang) })}</div>
        </section>
        <div className="facts">
          <div className="fact"><b className="dot">{t('plan_earns_t')}</b>{t('plan_earns_b')}</div>
          <div className="fact"><b>{t('plan_wait_t', { min: 12, max: 24 })}</b>{t('plan_wait_b')}</div>
        </div>
        <div className="bottom">
          <button type="button" className="btn" onClick={create}>{t('plan_create')}</button>
        </div>
      </main>
    </>
  )
}
