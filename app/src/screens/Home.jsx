import { useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header, Ring } from '../components/ui.jsx'
import { listGoals, progress } from '../lib/goals.js'
import { catalogBrands, brandOf } from '../lib/brands.js'
import { findItem } from '../lib/catalog.js'
import { planOf } from '../lib/pace.js'
import { fmtDate, fmtNim } from '../lib/format.js'

// "Call dibs. Save up." -> ["Call dibs.", "Save up."]
const splitFirst = (s) => { const i = s.indexOf('. '); return i < 0 ? [s, ''] : [s.slice(0, i + 1), s.slice(i + 2)] }

// Brand of a goal: stored on the goal (v2.2), or derived from its catalogue item.
export function goalBrand(goal) {
  if (goal.logo) return { key: goal.brandKey, name: goal.brandName, logo: goal.logo }
  return brandOf(findItem(goal.itemId)) || { name: goal.itemName }
}

export default function Home() {
  const { address } = useApp()
  const goals = listGoals(address)
  return goals.length === 0 ? <Welcome /> : <Hub goals={goals} />
}

// First run: the brand moment and three real picks (UI v2.2, welcome A).
function Welcome() {
  const { t, go } = useApp()
  const picks = catalogBrands().slice(0, 3)
  const [picked, setPicked] = useState(null)
  const brand = picks.find((b) => b.key === picked)
  return (
    <>
      <div className="welcome-hero">
        <Header onInk />
        <div className="big-ring" aria-hidden="true">
          <svg viewBox="0 0 156 156" width="156" height="156">
            <circle cx="78" cy="78" r="66" fill="none" stroke="#35323f" strokeWidth="12" />
            <circle className="arc" cx="78" cy="78" r="66" fill="none" stroke="#E8482A" strokeWidth="12" strokeLinecap="round" transform="rotate(-90 78 78)" />
          </svg>
          <img src="/brand/mark-cream.png" alt="" />
        </div>
        <p className="tl">{splitFirst(t('welcome_t1'))[0]} <span className="dim">{splitFirst(t('welcome_t1'))[1]}</span><br /><span className="last">{t('welcome_t2')}</span></p>
        <p className="sub">{t('welcome_sub')}</p>
      </div>
      <main className="screen">
        <p className="sec-label">{t('welcome_popular')}</p>
        <div className="picks">
          {picks.map((b) => (
            <button type="button" key={b.key} className={`pick${b.key === picked ? ' on' : ''}`} aria-pressed={b.key === picked} onClick={() => setPicked(b.key)}>
              <BrandLogo brand={b} />
              <b>{b.name}</b>
              <span>{t('cat_from', { price: b.from })}</span>
            </button>
          ))}
        </div>
        <p className="trust"><i>✓</i>{t('welcome_trust1')}</p>
        <p className="trust"><i>✓</i>{t('welcome_trust2')}</p>
        <div className="bottom">
          {brand ? (
            <button type="button" className="btn tall" onClick={() => go('plan', { brandKey: brand.key })}>
              {t('welcome_cta_pick', { brand: brand.name })}<small>{t('welcome_cta_pick_sub')}</small>
            </button>
          ) : (
            <button type="button" className="btn tall" onClick={() => go('catalog')}>
              {t('welcome_cta_all')}<small>{t('welcome_cta_all_sub')}</small>
            </button>
          )}
        </div>
      </main>
    </>
  )
}

// Returning user: the active goal as a hero card, then past dibs and other brands.
function Hub({ goals }) {
  const { t, lang, go } = useApp()
  const active = goals.find((g) => g.status !== 'redeemed')
  const past = goals.filter((g) => g.status === 'redeemed')
  const others = catalogBrands().filter((b) => !active || b.key !== goalBrand(active).key).slice(0, 4)
  return (
    <>
      <Header />
      <main className="screen">
        {active && <ActiveGoal goal={active} />}
        {past.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="sec-head"><h3>{t('home_past')}</h3></div>
            {past.map((g) => {
              return (
                <button type="button" key={g.id} className="past" onClick={() => go('done', { goalId: g.id })}>
                  <BrandLogo brand={goalBrand(g)} />
                  <div><b>{g.itemName} · {g.itemDetail}</b><span className="s">{fmtDate(g.payment?.at || g.createdAt, lang)}</span></div>
                  <span className="code">{t('home_code')}</span>
                </button>
              )
            })}
          </section>
        )}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="sec-head"><h3>{t('home_else')}</h3></div>
          <div className="bchips">
            {others.map((b) => (
              <button type="button" key={b.key} className="bchip" onClick={() => go('plan', { brandKey: b.key })}><BrandLogo brand={b} />{b.name}</button>
            ))}
            <button type="button" className="bchip more" onClick={() => go('catalog')}>{t('see_all')} ›</button>
          </div>
        </section>
        <div className="bottom">
          <button type="button" className="btn" onClick={() => go('catalog')}>{t('home_new2')}</button>
        </div>
      </main>
    </>
  )
}

function ActiveGoal({ goal }) {
  const { t, lang, go } = useApp()
  const p = planOf(goal)
  const pct = progress(goal)
  const brand = goalBrand(goal)
  const next = Math.max(1, Math.min(p.remaining, p.pace.amount || p.weekly))
  return (
    <>
      <div>
        <p className="small" style={{ color: 'var(--gold)', fontWeight: 600 }}>{t('home_pct', { pct: Math.round(pct * 100) })}</p>
        <h2 className="title">{goal.itemName}</h2>
      </div>
      <section className="hero">
        <div className="top">
          <BrandLogo brand={brand} />
          <div><div className="t1">{goal.itemName} · {goal.itemDetail}</div><div className="t2">{fmtDate(goal.deadline, lang)} · {t(p.daysLeft === 1 ? 'days_left_one' : 'days_left_other', { count: p.daysLeft })}</div></div>
        </div>
        <div className="mid">
          <div className="ring-wrap">
            <Ring value={pct} size={100} label={`${Math.round(pct * 100)}%`} track="#35323f" color={pct >= 1 ? '#15896A' : '#E8482A'} />
            <div className="pct">{Math.round(pct * 100)}%</div>
          </div>
          <div>
            <div className="n">{fmtNim(p.saved, lang)} NIM</div>
            <div className="m">{t('goal_of2', { target: fmtNim(goal.targetNim, lang) })} · {t('goal_to_go', { amount: fmtNim(p.remaining, lang) })}</div>
            <div className="earning">{t('goal_earning_soon')}</div>
          </div>
        </div>
        <div className="acts">
          {pct < 1 && goal.status === 'saving'
            ? <button type="button" className="btn" onClick={() => go('goal', { goalId: goal.id, amount: next })}>{t('goal_add', { nim: fmtNim(next, lang) })}</button>
            : <button type="button" className="btn" onClick={() => go('goal', { goalId: goal.id })}>{t('home_details')}</button>}
          {pct < 1 && goal.status === 'saving' && <button type="button" className="btn outline" onClick={() => go('goal', { goalId: goal.id })}>{t('home_details')}</button>}
        </div>
      </section>
      {p.pace.kind !== 'done' && <PaceLine pace={p.pace} />}
    </>
  )
}

export function PaceLine({ pace }) {
  const { t, lang } = useApp()
  if (pace.kind === 'behind') return <div className="band-warn">{t('goal_pace_behind', { amount: fmtNim(pace.amount, lang), date: fmtDate(pace.date, lang) })}</div>
  if (pace.kind === 'ahead') return <div className="band-mint">{t('goal_pace_ahead', { date: fmtDate(pace.date, lang) })}</div>
  return <div className="band-mint">{t('goal_pace_on', { amount: fmtNim(pace.amount, lang), date: fmtDate(pace.date, lang) })}</div>
}
