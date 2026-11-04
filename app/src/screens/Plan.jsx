import { useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Icon } from '../components/ui.jsx'
import { findItem } from '../lib/catalog.js'
import { createGoal } from '../lib/goals.js'
import { usdToNim } from '../lib/price.js'
import { addDays, fmtDate, fmtNim, fmtUsd, weeksUntil } from '../lib/format.js'

const OPTIONS = [
  { key: 'plan_w2', days: 14 },
  { key: 'plan_m2', days: 61 },
  { key: 'plan_m6', days: 183 },
]

export default function Plan({ itemId }) {
  const { t, lang, address, prices, back, reset } = useApp()
  const item = findItem(itemId)
  const [days, setDays] = useState(61)
  if (!item) return null
  if (!prices) {
    return <><Header onBack={back} /><main className="screen"><p className="sub">{t('loading')}</p></main></>
  }

  const targetNim = usdToNim(item.usd, prices.nimUsd)
  const deadline = addDays(days)
  const weekly = Math.ceil(targetNim / weeksUntil(deadline))

  const create = () => {
    const goal = createGoal(address, { item, targetNim, deadline })
    reset('goal', { goalId: goal.id, created: true })
  }

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <div>
          <p className="small" style={{ fontWeight: 700 }}>{t('plan_label')}</p>
          <h2 className="title">{item.name}, {item.detail}</h2>
        </div>
        <section className="card">
          <div className="row">
            <span className="sub">{t('plan_target')}</span>
            <span style={{ fontSize: 22, fontWeight: 800 }}>{fmtNim(targetNim, lang)} NIM</span>
          </div>
          <span className="sub">{t('plan_by')}</span>
          <div className="pills" role="group" aria-label={t('plan_by')}>
            {OPTIONS.map((o) => (
              <button type="button" key={o.key} className={`pill${o.days === days ? ' on' : ''}`} aria-pressed={o.days === days} onClick={() => setDays(o.days)}>{t(o.key)}</button>
            ))}
          </div>
          <div className="hint">{t('plan_suggest', { nim: fmtNim(weekly, lang), date: fmtDate(deadline, lang) })}</div>
          <p className="small">{t('plan_price', { usd: fmtUsd(item.usd, lang) })} · {t(prices.live ? 'plan_rate' : 'plan_rate_offline', { usd: fmtUsd(prices.nimUsd, lang) })}</p>
        </section>
        <div className="note">
          <div className="ico"><Icon name="shield" size={20} /></div>
          <p className="sub" style={{ fontSize: 14 }}>{t('plan_staking')}</p>
        </div>
        <div className="bottom">
          <button type="button" className="btn" onClick={create}>{t('plan_create')}</button>
        </div>
      </main>
    </>
  )
}
