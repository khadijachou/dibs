// "See your saving" (v1.3.0) building blocks: the weekly bars, the weeks ring and tiles, the goals bars, the day grid,
// the Savings entry row, the Home weekly recap and the goal's week-by-week card. All display only: every number comes
// from lib/insights.js (pure) over the goals already on this phone. Nothing is sent anywhere.
import { useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Ring } from './ui.jsx'
import { fmtNim } from '../lib/format.js'
import { itemLabel } from '../lib/itemName.js'
import { progress } from '../lib/goals.js'
import { goalBrand } from '../screens/Home.jsx'
import { compactNim, goalWeekly, insights, recap, weekKey } from '../lib/insights.js'

// Short date for a bar label: day + short month in the user's language (Intl's narrow space swapped for a plain
// no-break space, as lib/format.js does, so Inter renders it).
const NNBSP = new RegExp(String.fromCharCode(0x202f), 'g')
const shortDate = (ms, lang) =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(ms)).replace(NNBSP, ' ')

// The 8 weekly bars. amounts: the compact figure above each bar and the week's Monday (or "Now") below.
// Current week in butter, the others coral, an empty week a thin grey bar.
function Bars({ weekly, weekStarts = null, amounts = false, ends = false }) {
  const { t, lang } = useApp()
  const max = Math.max(1, ...weekly)
  return (
    <div className={`ins-bars${amounts ? ' with-n' : ''}`}>
      {weekly.map((n, i) => {
        const now = i === weekly.length - 1
        const h = n > 0 ? Math.max(8, Math.round((n / max) * 100)) : 0
        const date = weekStarts ? shortDate(weekStarts[i], lang) : ''
        const label = weekStarts ? t('ins_bar_label', { date, n: fmtNim(n, lang) }) : undefined
        return (
          <div className="ins-bar" key={i} aria-label={label}>
            {amounts && <span className="ins-bar-n" aria-hidden="true">{n > 0 ? compactNim(n, lang) : ''}</span>}
            <span className="ins-bar-track" aria-hidden="true">
              <i className={`ins-bar-fill${now ? ' now' : ''}${n === 0 ? ' empty' : ''}`} style={n > 0 ? { height: `${h}%` } : undefined} />
            </span>
            {amounts && <span className="ins-bar-d" aria-hidden="true">{now ? t('ins_now') : date}</span>}
          </div>
        )
      })}
      {ends && <div className="ins-ends" aria-hidden="true"><span>{t('gw_ago')}</span><span>{t('ins_now')}</span></div>}
    </div>
  )
}

// Tiny bars for the Savings row: coral, empty weeks grey, no labels.
function MiniBars({ weekly }) {
  const max = Math.max(1, ...weekly)
  return (
    <span className="ins-mini" aria-hidden="true">
      {weekly.map((n, i) => (
        <i key={i} className={`ins-mini-bar${n === 0 ? ' empty' : ''}`} style={n > 0 ? { height: `${Math.max(22, Math.round((n / max) * 100))}%` } : undefined} />
      ))}
    </span>
  )
}

// The "NIM added per week" card (Insights page).
export function WeeklyCard({ data }) {
  const { t, lang } = useApp()
  return (
    <section className="card ins-card">
      <div className="sec-head"><h3>{t('ins_weekly')}</h3><span className="small">{t('ins_total8', { n: fmtNim(data.total8, lang) })}</span></div>
      <Bars weekly={data.weekly} weekStarts={data.weekStarts} amounts />
    </section>
  )
}

// The weeks-saved ring and the three tiles (This month, Goals, Deposits).
export function WeeksRow({ data }) {
  const { t, lang } = useApp()
  return (
    <div className="ins-row2">
      <div className="card ins-ring-card">
        <Ring value={data.weeksSaved / 8} size={78} stroke={11} color="#15896A" label={t('ins_ring_label', { n: data.weeksSaved })} />
        <div className="ins-ring-tx"><b>{t('ins_ring_n', { n: data.weeksSaved })}</b><span>{t('ins_ring')}</span></div>
      </div>
      <div className="ins-tiles">
        <div className="ins-tile"><b>+{fmtNim(data.thisMonth, lang)}</b><span>{t('ins_tile_month')}</span></div>
        <div className="ins-tile"><b>{data.goalsCount}</b><span>{t('ins_tile_goals')}</span></div>
        <div className="ins-tile"><b>{data.depositsThisMonth}</b><span>{t('ins_tile_deposits')}</span></div>
      </div>
    </div>
  )
}

// Your goals side by side: one row per saving / unlocking / ready goal, with its progress.
export function GoalsSideBySide({ goals }) {
  const { t } = useApp()
  const list = goals.filter((g) => g.status === 'saving' || g.status === 'unlocking' || g.status === 'ready')
  if (!list.length) return null
  return (
    <section className="card ins-goals">
      <h3>{t('ins_goals')}</h3>
      {list.map((g) => {
        const pct = Math.round(progress(g) * 100)
        return (
          <div className="ins-goal" key={g.id}>
            <BrandLogo brand={goalBrand(g)} />
            <div className="ins-goal-main">
              <div className="ins-goal-top"><b>{itemLabel(t, g)}</b><span>{pct}%</span></div>
              <span className="ins-goal-bar" aria-hidden="true"><i className={pct >= 100 ? 'full' : undefined} style={{ width: `${Math.max(3, pct)}%` }} /></span>
            </div>
          </div>
        )
      })}
    </section>
  )
}

// Days you saved: 56 day squares (14 by 4), oldest top left, four mint shades by share of the best day.
export function DayGrid({ days }) {
  const { t } = useApp()
  const best = Math.max(0, ...days)
  const level = (n) => { if (n <= 0 || best <= 0) return 0; const s = n / best; return s <= 1 / 3 ? 1 : s <= 2 / 3 ? 2 : 3 }
  const total = days.filter((n) => n > 0).length
  return (
    <section className="card ins-days">
      <div className="sec-head"><h3>{t('ins_days')}</h3><span className="small">{t('ins_days_range')}</span></div>
      <div className="ins-grid" role="img" aria-label={t('ins_days_label', { d: total })}>
        {days.map((n, i) => <i key={i} className={`ins-cell l${level(n)}`} />)}
      </div>
      <div className="ins-legend" aria-hidden="true">
        <span>{t('ins_less')}</span>
        <i className="ins-cell l0" /><i className="ins-cell l1" /><i className="ins-cell l2" /><i className="ins-cell l3" />
        <span>{t('ins_more')}</span>
      </div>
    </section>
  )
}

// Savings entry: "Insights", the 8-week total, 8 mini bars and a chevron. Hidden with no counted deposit at all.
export function InsightsRow({ goals }) {
  const { t, lang, go } = useApp()
  const data = insights(goals, Date.now())
  if (!data.hasAny) return null
  return (
    <button type="button" className="ins-link" onClick={() => go('insights')}>
      <div className="ins-link-tx">
        <b>{t('ins_title')}</b>
        <span>{t('ins_total8', { n: fmtNim(data.total8, lang) })}</span>
      </div>
      <MiniBars weekly={data.weekly} />
      <span className="chev" aria-hidden="true">›</span>
    </button>
  )
}

// Weekly recap on Home: about the week before, shown once a week until the x closes it (dibs.recapSeen = that week's
// Monday). Only when last week had at least one counted deposit.
const SEEN = 'dibs.recapSeen'
const readSeen = () => { try { return localStorage.getItem(SEEN) } catch { return null } }
const writeSeen = (k) => { try { localStorage.setItem(SEEN, k) } catch { /* storage blocked */ } }

export function RecapCard({ goals }) {
  const { t, lang, go } = useApp()
  const [closed, setClosed] = useState(false)
  const now = Date.now()
  const data = recap(goals, now)
  const key = weekKey(now)
  if (!data || closed || readSeen() === key) return null
  const close = () => { writeSeen(key); setClosed(true) }
  const letters = t('recap_letters').split(' ')
  return (
    <section className="recap">
      <div className="recap-head">
        <span className="recap-label">{t('recap_label')}</span>
        <button type="button" className="recap-x" aria-label={t('ob_close')} onClick={close}>×</button>
      </div>
      <div className="recap-amt">+{fmtNim(data.nim, lang)} NIM</div>
      <div className="recap-added">{t(data.daysWithDeposit === 1 ? 'recap_days_one' : 'recap_days_other', { d: data.daysWithDeposit })}</div>
      <div className="recap-strip" aria-hidden="true">
        {data.perDay.map((on, i) => <span key={i} className={`recap-day${on ? ' on' : ''}`}>{letters[i]}</span>)}
      </div>
      <div className="recap-div" />
      <div className="recap-foot">
        <span>{t('recap_weeks', { n: data.weeksSaved })}</span>
        <button type="button" className="recap-see" onClick={() => go('insights')}>{t('recap_link')}<i className="chev" aria-hidden="true">›</i></button>
      </div>
    </section>
  )
}

// Week by week on a goal (Goal details): the same 8 bars for this goal. Hidden with no counted deposit.
export function GoalWeekCard({ goal }) {
  const { t, lang } = useApp()
  const { weekly, total8 } = goalWeekly(goal, Date.now())
  if (!(total8 > 0)) return null
  return (
    <section className="card ins-card">
      <div className="sec-head"><h3>{t('gw_title')}</h3><span className="small">{t('ins_total8', { n: fmtNim(total8, lang) })}</span></div>
      <Bars weekly={weekly} ends />
    </section>
  )
}
