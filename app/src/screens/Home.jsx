import { CardIssue } from '../components/CardIssue.jsx'
import { useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { detailText, fromText, itemLabel } from '../lib/itemName.js'
import { BrandLogo, Header, Ring, DibsMark } from '../components/ui.jsx'
import { listGoals, progress } from '../lib/goals.js'
import { BRANDS, catalogBrands, brandOf } from '../lib/brands.js'
import { findItem } from '../lib/catalog.js'
import { planOf } from '../lib/pace.js'
import { fmtDate, fmtNim } from '../lib/format.js'
import { useCountUp } from '../lib/useCountUp.js'
import { useEarned } from '../lib/earned.js'
import { getName } from '../lib/name.js'
import { MilestoneLine, useGoalMilestone } from '../components/Milestone.jsx'
import { GoalDot, GoalStatus, goalPace } from '../components/GoalStatus.jsx'
import { StatsCard } from '../components/StatsConsent.jsx'
import BrandSheet from '../components/BrandSheet.jsx'

// Welcome screen (no goal yet): "Welcome, Sam" when the user gave a name during onboarding or in More; nothing otherwise.
function Hello() {
  const { t } = useApp()
  const name = getName()
  return name ? <p className="hello on-ink">{t('greet_first', { name })}</p> : null
}

// Hub: "Welcome back, Sam", or "Welcome back" when no name is saved.
function Greeting() {
  const { t } = useApp()
  const name = getName()
  return <p className="hello">{name ? t('greet_back', { name }) : t('greet_back_anon')}</p>
}

// "Call dibs. Save up." -> ["Call dibs.", "Save up."]
const splitFirst = (s) => { const i = s.indexOf('. '); return i < 0 ? [s, ''] : [s.slice(0, i + 1), s.slice(i + 2)] }

// Brand of a goal: stored on the goal (v2.2), or derived from its catalogue item.
// The goal's brand from what the goal saved (brandKey), so it keeps its logo even when its card has left the catalogue.
export function goalBrand(goal) {
  const known = goal.brandKey ? BRANDS.find((b) => b.key === goal.brandKey) : null
  if (known || goal.logo) return { ...(known || {}), key: goal.brandKey, name: goal.brandName || known?.name, logo: goal.logo || known?.logo || null }
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
        <Header onInk langChip />
        <div className="big-ring" aria-hidden="true">
          <svg viewBox="0 0 156 156" width="156" height="156">
            <circle cx="78" cy="78" r="66" fill="none" stroke="#35323f" strokeWidth="12" />
            <circle className="arc" cx="78" cy="78" r="66" fill="none" stroke="#E8482A" strokeWidth="12" strokeLinecap="round" transform="rotate(-90 78 78)" />
          </svg>
          <DibsMark className="big-mark" />
        </div>
        <Hello />
        <p className="tl">{splitFirst(t('welcome_t1'))[0]} <span className="dim">{splitFirst(t('welcome_t1'))[1]}</span><br /><span className="last">{t('welcome_t2')}</span></p>
        <p className="sub">{t('welcome_sub')}</p>
      </div>
      <main className="screen">
        <StatsCard />
        <p className="sec-label">{t('welcome_popular')}</p>
        <div className="picks">
          {picks.map((b) => (
            <button type="button" key={b.key} className={`pick${b.key === picked ? ' on' : ''}`} aria-pressed={b.key === picked} onClick={() => setPicked(b.key)}>
              <BrandLogo brand={b} />
              <b>{b.name}</b>
              <span>{fromText(t, b)}</span>
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
  const { t, address, go, reset } = useApp()
  const earned = useEarned(address)
  const isPast = (g) => g.status === 'redeemed' || g.status === 'withdrawn'
  const live = goals.filter((g) => !isPast(g))
  const active = live[0]
  // Newest first: the purchase date, or the return date for a withdrawn goal. Home keeps the 3 latest.
  const endOf = (g) => String((g.status === 'withdrawn' ? g.withdrawnAt : g.payment?.at) || g.createdAt || '')
  const past = goals.filter(isPast).sort((a, b) => endOf(b).localeCompare(endOf(a)))
  const liveKeys = new Set(live.map((g) => goalBrand(g).key))
  const others = catalogBrands().filter((b) => !liveKeys.has(b.key)).slice(0, 4)
  const [sheet, setSheet] = useState(null) // brand key whose sheet is open ("Call dibs on something else")
  const sheetBrand = others.find((b) => b.key === sheet)
  return (
    <>
      <Header langChip />
      <main className="screen">
        <h2 className="title">{t('home_title')}</h2>
        {/* Several goals: the greeting shares its row with the carousel dots (GoalWallet). One goal: greeting, then the card. */}
        {/* Usage stats: asked once under the greeting to users who finished onboarding before the consent step. */}
        {live.length > 1 ? <GoalWallet goals={live} earned={earned} /> : <><Greeting /><StatsCard />{active && <GoalHero goal={active} earned={earned} />}</>}
        {past.length > 0 && <PastList goals={past.slice(0, 3)} title={t('home_past')} />}
        {past.length > 3 && (
          <button type="button" className="see-all-link" onClick={() => { reset('history', { focus: 'cards' }); window.scrollTo(0, 0) }}>{t('home_see_all', { n: past.length })}</button>
        )}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="sec-head"><h3>{t('home_else')}</h3></div>
          <div className="bchips">
            {others.map((b) => (
              <button type="button" key={b.key} className="bchip" aria-haspopup="dialog" onClick={() => setSheet(b.key)}><BrandLogo brand={b} />{b.name}</button>
            ))}
            <button type="button" className="bchip more" onClick={() => go('catalog')}>{t('see_all')} ›</button>
          </div>
        </section>
        <div className="bottom">
          <button type="button" className="btn tall" onClick={() => go('catalog')}>{t('home_new2')}<small>{t('home_new2_sub')}</small></button>
        </div>
      </main>
      {sheetBrand && <BrandSheet brand={sheetBrand} onClose={() => setSheet(null)} onPick={() => { setSheet(null); go('plan', { brandKey: sheetBrand.key }) }} />}
    </>
  )
}

// Past dibs: redeemed goals open Done (the code), withdrawn ones the goal screen (with Delete).
export function PastList({ goals, title }) {
  const { t, lang, go } = useApp()
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {title && <div className="sec-head"><h3>{title}</h3></div>}
      {goals.map((g) => {
        const back = g.status === 'withdrawn'
        const end = back ? g.withdrawnAt : g.payment?.at
        const days = Math.max(1, Math.ceil((Date.parse(end || g.createdAt) - Date.parse(g.createdAt)) / 864e5))
        return (
          <button type="button" key={g.id} className="past" onClick={() => go(back ? 'goal' : 'done', { goalId: g.id, mode: 'details' })}>
            <BrandLogo brand={goalBrand(g)} />
            <div><b>{itemLabel(t, g)}</b><span className="s">{fmtDate(end || g.createdAt, lang)} · {t(days === 1 ? 'done_stat_days_one' : 'done_stat_days_other', { count: days })}</span></div>
            <span className={`code${back ? ' returned' : ''}`}>{t(back ? 'withdraw_returned' : 'home_code')}</span>
          </button>
        )
      })}
    </section>
  )
}

// Several goals at once: a wallet of cards. Tabs to pick one, swipe between them,
// each card keeps its own Add and Details. One staker underneath; goals are envelopes.
function GoalWallet({ goals, earned }) {
  const { t } = useApp()
  const [i, setI] = useState(0)
  const ref = useRef(null)
  const cur = Math.min(i, goals.length - 1)
  const pick = (k) => {
    const el = ref.current
    const card = el?.children[k]
    if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft - 20, behavior: 'smooth' })
    setI(k)
  }
  const onScroll = () => {
    const el = ref.current
    if (!el || !el.children.length) return
    const w = el.children[0].offsetWidth + 12
    const k = Math.max(0, Math.min(goals.length - 1, Math.round(el.scrollLeft / w)))
    if (k !== i) setI(k)
  }
  return (
    <>
      <div className="greet-row"><Greeting /><CarouselDots count={goals.length} current={cur} /></div>
      <StatsCard />
      <div className="gw-tabs" role="tablist">
        {goals.map((g, k) => (
          <button type="button" role="tab" aria-selected={k === i} key={g.id} className={`gw-tab${k === i ? ' on' : ''}`} onClick={() => pick(k)}>
            <BrandLogo brand={goalBrand(g)} />
            <span>{detailText(t, g, { short: true })}</span>
            <b>{Math.round(progress(g) * 100)}%</b>
          </button>
        ))}
      </div>
      <div className="gwallet" ref={ref} onScroll={onScroll}>
        {goals.map((g) => <div className="gw-card" key={g.id}><GoalHero goal={g} earned={earned} /></div>)}
      </div>
    </>
  )
}

// Where the wallet is: one dot per goal, the current one a coral pill.
function CarouselDots({ count, current }) {
  const { t } = useApp()
  return (
    <span className="cdots" role="img" aria-label={t('carousel_dot', { i: current + 1, n: count })}>
      {Array.from({ length: count }, (_, k) => <i key={k} className={k === current ? 'on' : undefined} />)}
    </span>
  )
}

// earned: stakeSummary() (same figures as Stake and the goal screen), null while unknown. The chip shows this goal's share.
function GoalHero({ goal, earned }) {
  const { t, lang, go } = useApp()
  const milestone = useGoalMilestone(goal)
  const p = planOf(goal)
  const pct = progress(goal)
  const brand = goalBrand(goal)
  const next = Math.max(1, Math.min(p.remaining, p.pace.amount || p.weekly))
  const savedShown = useCountUp(p.saved)
  const remainingShown = useCountUp(p.remaining)
  return (
      <section className={`hero${goalPace(goal) ? ' has-dot' : ''}`}>
        <GoalDot goal={goal} />
        <div className="top">
          <BrandLogo brand={brand} />
          <div><div className="t1">{itemLabel(t, goal)}</div><div className="t2">{fmtDate(goal.deadline, lang)} · {t(p.daysLeft === 1 ? 'days_left_one' : 'days_left_other', { count: p.daysLeft })}</div></div>
        </div>
        <div className="mid">
          <div className={`ring-wrap${milestone ? ' ms-pulse' : ''}`}>
            <Ring value={pct} size={100} label={`${Math.round(pct * 100)}%`} track="#35323f" color={pct >= 1 ? '#15896A' : '#E8482A'} />
            <div className="pct">{Math.round(pct * 100)}%</div>
          </div>
          <div>
            <div className="n">{fmtNim(Math.round(savedShown), lang)} NIM</div>
            <div className="m">{t('goal_of2', { target: fmtNim(goal.targetNim, lang) })} · {t('goal_to_go', { amount: fmtNim(Math.round(remainingShown), lang) })}</div>
            <GoalStatus goal={goal} earned={earned?.byGoal[goal.id]} />
          </div>
        </div>
        <MilestoneLine milestone={milestone} />
        <CardIssue goal={goal} />
        <div className="acts">
          {pct < 1 && goal.status === 'saving'
            ? <button type="button" className="btn" onClick={() => go('goal', { goalId: goal.id, mode: 'add', amount: next })}>{t('goal_add', { nim: fmtNim(next, lang) })}</button>
            : <button type="button" className="btn" onClick={() => go('goal', { goalId: goal.id, mode: 'details' })}>{t('home_details')}</button>}
          {pct < 1 && goal.status === 'saving' && <button type="button" className="btn outline" onClick={() => go('goal', { goalId: goal.id, mode: 'details' })}>{t('home_details')}</button>}
        </div>
      </section>
  )
}

// The pace band (Goal Details). dot: the status dot at its start; children: the late band's actions.
export function PaceLine({ pace, lagWeeks = 0, dot = null, children = null }) {
  const { t, lang } = useApp()
  const amount = fmtNim(pace.amount, lang)
  const date = fmtDate(pace.date, lang)
  const [tone, text] = pace.kind === 'late' ? ['band-red', t('goal_pace_late', { n: lagWeeks, amount, date })]
    : pace.kind === 'behind' ? ['band-warn', t('goal_pace_behind', { amount, date })]
    : pace.kind === 'ahead' ? ['band-mint', t('goal_pace_ahead', { date })]
    : ['band-mint', t('goal_pace_on', { amount, date })]
  if (!dot && !children) return <div className={tone}>{text}</div>
  return (
    <div className={`${tone} pace-band`}>
      {dot}
      <div className="pace-body"><span>{text}</span>{children}</div>
    </div>
  )
}
