import { CardIssue } from '../components/CardIssue.jsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { detailText, itemLabel } from '../lib/itemName.js'
import { BrandLogo, CREAM, Header, DibsMark } from '../components/ui.jsx'
import { listGoals, progress } from '../lib/goals.js'
import { BRANDS, catalogBrands, brandOf } from '../lib/brands.js'
import { findItem } from '../lib/catalog.js'
import { planOf } from '../lib/pace.js'
import { fmtDate, fmtNim } from '../lib/format.js'
import { useCountUp } from '../lib/useCountUp.js'
import { useEarned } from '../lib/earned.js'
import { getName } from '../lib/name.js'
import { MilestoneLine, useGoalMilestone } from '../components/Milestone.jsx'
import { GoalDot, GoalDotLabel, GoalStatus, goalPace } from '../components/GoalStatus.jsx'
import { addCaptionKey } from '../lib/addCaption.js'
import { StatsCard } from '../components/StatsConsent.jsx'
import HowSteps from '../components/HowSteps.jsx'
import GoalRing from '../components/GoalRing.jsx'
import Num from '../components/Num.jsx'
import PromoBanner from '../components/PromoBanner.jsx'
import BrandSheet from '../components/BrandSheet.jsx'
import { ReadyBox, useReady } from '../components/ReadyState.jsx'

// Welcome screen (no goal yet): "Welcome, Sam" when the user gave a name during onboarding or in More; nothing otherwise.
function Hello() {
  const { t } = useApp()
  const name = getName()
  return name ? <p className="hello on-ink">{t('greet_first', { name })}</p> : null
}

// Hub: the label over the goal card(s). The greeting itself moved to the Welcome back moment after the splash.
function GoalsLabel({ count }) {
  const { t } = useApp()
  return <p className="hello">{t(count === 0 ? 'home_goals_none' : count === 1 ? 'home_goals_one' : 'home_goals_other')}</p>
}

// "Call dibs. Save up." -> ["Call dibs.", "Save up."]
const splitFirst = (s) => { const i = s.indexOf('. '); return i < 0 ? [s, ''] : [s.slice(0, i + 1), s.slice(i + 2)] }

// Brand of a goal: stored on the goal (v2.2), or derived from its catalogue item.
// The goal's brand from what the goal saved (brandKey), so it keeps its logo even when its card has left the catalogue.
export function goalBrand(goal) {
  const known = goal.brandKey ? BRANDS.find((b) => b.key === goal.brandKey) : null
  // A known brand always shows its current logo (goals saved the logo path when created: old Flightgift goals saved
  // flightgift.jpg); the saved path only serves brands no longer in BRANDS.
  if (known || goal.logo) return { ...(known || {}), key: goal.brandKey, name: goal.brandName || known?.name, logo: known?.logo || goal.logo || null }
  return brandOf(findItem(goal.itemId)) || { name: goal.itemName }
}

export default function Home() {
  const { address } = useApp()
  const goals = listGoals(address)
  return goals.length === 0 ? <Welcome /> : <Hub goals={goals} />
}

// First run: the brand moment, then the same photo banner as the hub (a slide opens the brand sheet).
function Welcome() {
  const { t, go } = useApp()
  const [sheet, setSheet] = useState(null) // brand key whose sheet is open (promo banner)
  const sheetBrand = sheet ? catalogBrands().find((b) => b.key === sheet) : null
  return (
    <>
      <div className="welcome-hero">
        <Header onInk />
        <div className="big-ring" aria-hidden="true">
          <svg viewBox="0 0 156 156" width="156" height="156">
            <circle cx="78" cy="78" r="66" fill="none" stroke="#35323f" strokeWidth="12" />
            <circle className="arc" cx="78" cy="78" r="66" fill="none" stroke="#E8482A" strokeWidth="12" strokeLinecap="round" transform="rotate(-90 78 78)" />
          </svg>
          <DibsMark className="big-mark" color={CREAM} />
        </div>
        <Hello />
        <p className="tl">{splitFirst(t('welcome_t1'))[0]} <span className="dim">{splitFirst(t('welcome_t1'))[1]}</span><br /><span className="last">{t('welcome_t2')}</span></p>
        <p className="sub">{t('welcome_sub')}</p>
      </div>
      <main className="screen">
        <StatsCard />
        <PromoBanner onOpen={setSheet} />
        <p className="trust"><i>✓</i>{t('welcome_trust1')}</p>
        <p className="trust"><i>✓</i>{t('welcome_trust2')}</p>
        {/* Until the first goal: How Dibs works, the same steps as the first-run pop-up, drawn when scrolled to. */}
        <section className="hiw-home">
          <div className="sec-head"><h3>{t('hiw_title')}</h3></div>
          <div className="hiw-panel"><HowSteps reveal /></div>
        </section>
        <div className="bottom">
          <button type="button" className="btn tall" onClick={() => go('catalog')}>
            {t('welcome_cta_all')}<small>{t('welcome_cta_all_sub')}</small>
          </button>
        </div>
      </main>
      {sheetBrand && <BrandSheet brand={sheetBrand} onClose={() => setSheet(null)} onPick={(region, itemId) => { setSheet(null); go('plan', { brandKey: sheetBrand.key, region, itemId }) }} />}
    </>
  )
}

// Returning user: the goals label and the active goal(s), the photo banner, then New goal.
function Hub({ goals }) {
  const { t, address, go } = useApp()
  const earned = useEarned(address)
  const isPast = (g) => g.status === 'redeemed' || g.status === 'withdrawn'
  const live = goals.filter((g) => !isPast(g))
  const active = live[0]
  const [sheet, setSheet] = useState(null) // brand key whose sheet is open (promo banner)
  const sheetBrand = sheet ? catalogBrands().find((b) => b.key === sheet) : null
  return (
    <>
      <Header />
      <main className="screen">
        <h2 className="sr-only">{t('home_title')}</h2>
        {/* Several goals: the goals label shares its row with the carousel dots (GoalWallet). One goal: label, then the card. */}
        {/* Usage stats: asked once under the goals label to users who finished onboarding before the consent step. */}
        {live.length > 1 ? <GoalWallet goals={live} earned={earned} /> : <><GoalsLabel count={live.length} /><StatsCard />{active && <GoalHero goal={active} earned={earned} />}</>}
        <PromoBanner onOpen={setSheet} />
        {/* At least one live goal: a quiet outline button right under the photos (v1.0.8). No live goal (all bought or
            withdrawn): the coral button sticky at the bottom, as before v1.0.8 (v1.0.9). */}
        {live.length > 0
          ? <button type="button" className="btn tall quiet" onClick={() => go('catalog')}>{'+ '}{t('home_new2')}<small>{t('home_new2_sub')}</small></button>
          : (
            <div className="bottom">
              <button type="button" className="btn tall" onClick={() => go('catalog')}>{t('home_new2')}<small>{t('home_new2_sub')}</small></button>
            </div>
          )}
      </main>
      {sheetBrand && <BrandSheet brand={sheetBrand} onClose={() => setSheet(null)} onPick={(region, itemId) => { setSheet(null); go('plan', { brandKey: sheetBrand.key, region, itemId }) }} />}
    </>
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
  const indexOf = (el) => Math.max(0, Math.min(goals.length - 1, Math.round(el.scrollLeft / (el.children[0].offsetWidth + 12))))
  // v1.0.10: each card keeps its natural height (no stretch to the tallest), and the row takes the height of the card
  // on screen, so the photos below move up under a short card. Set only once a swipe has settled (no finger down,
  // no scroll for 150 ms); the 200 ms ease is in CSS. Display only.
  const [h, setH] = useState(null)
  const touching = useRef(false)
  const settle = useRef(0)
  const fit = () => {
    const el = ref.current
    if (!el || !el.children.length || touching.current) return
    const card = el.children[indexOf(el)]
    const cs = getComputedStyle(el)
    setH(Math.ceil(card.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)))
  }
  const later = () => { clearTimeout(settle.current); settle.current = setTimeout(fit, 150) }
  useLayoutEffect(fit, [goals.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A card that changes height while on screen (count-ups, price checks, a goal changing state) refits the row.
    const el = ref.current
    if (!el || typeof ResizeObserver !== 'function') return undefined
    const ro = new ResizeObserver(later)
    for (const c of el.children) ro.observe(c)
    return () => { ro.disconnect(); clearTimeout(settle.current) }
  }, [goals.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const el = ref.current
    if (!el || !el.children.length) return
    const k = indexOf(el)
    if (k !== i) setI(k)
    later()
  }
  const down = () => { touching.current = true; clearTimeout(settle.current) }
  const up = () => { touching.current = false; later() }
  return (
    <>
      <div className="greet-row"><GoalsLabel count={goals.length} /><CarouselDots count={goals.length} current={cur} /></div>
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
      <div className="gwallet" ref={ref} onScroll={onScroll} onTouchStart={down} onTouchEnd={up} onTouchCancel={up} style={h ? { height: h } : undefined}>
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
  const cap = addCaptionKey(p, next) // the Add button's caption (display only)
  const savedShown = useCountUp(p.saved)
  const remainingShown = useCountUp(p.remaining)
  const rs = useReady(goal) // ready goals: does the saved NIM still cover the card at today's price (display only)
  return (
      <section className={`hero goal-card${goalPace(goal) ? ' has-dot' : ''}`}>
        <GoalDot goal={goal} />
        <div className="top">
          <BrandLogo brand={brand} />
          <div className="tx"><div className="t1">{itemLabel(t, goal)}</div><DateLine goal={goal} date={fmtDate(goal.deadline, lang)} days={t(p.daysLeft === 1 ? 'days_left_one' : 'days_left_other', { count: p.daysLeft })} /></div>
        </div>
        <div className="mid">
          <GoalRing goal={goal} pct={pct} milestone={milestone} ready={rs} />
          <div>
            <div className="n"><Num value={fmtNim(Math.round(savedShown), lang)} /> NIM</div>
            {rs
              ? <div className="m">{t('ready_home_line', { price: fmtNim(rs.price, lang) })}</div>
              : p.saved <= 0
                ? <div className="m">{t('goal_of_zero', { target: fmtNim(goal.targetNim, lang) })}</div>
                : <div className="m">{t('goal_of2', { target: fmtNim(goal.targetNim, lang) })} · {t('goal_to_go', { amount: fmtNim(Math.round(remainingShown), lang) })}</div>}
            <GoalStatus goal={goal} earned={earned?.byGoal[goal.id]} ready={rs} />
          </div>
        </div>
        {rs && <ReadyBox rs={rs} compact />}
        <MilestoneLine milestone={milestone} />
        <CardIssue goal={goal} />
        <div className="acts">
          {pct < 1 && goal.status === 'saving'
            ? <AddButton label={t('goal_add', { nim: fmtNim(next, lang) })} caption={cap ? t(cap) : null} onClick={() => go('goal', { goalId: goal.id, mode: 'add', amount: next })} />
            : <button type="button" className="btn" onClick={() => go('goal', { goalId: goal.id, mode: 'details' })}>{t('home_details')}</button>}
          {pct < 1 && goal.status === 'saving' && <button type="button" className="btn outline" onClick={() => go('goal', { goalId: goal.id, mode: 'details' })}>{t('home_details')}</button>}
        </div>
      </section>
  )
}

// The goal card's date line (v1.0.8, display only): the dot's short label takes priority over the days left.
// The first form that fits on one line wins (styles: .t2.dl):
//   1 "{date} · {days left} · {label}"   2 "{date} · {label}"   3 "{date} · {days left}" (no label, as before)
// Checked before paint and again when the card's width changes. Screen readers always get the date and the days
// left (hidden visually in form 2); the label is aria-hidden, the dot's aria-label says it in full.
function DateLine({ goal, date, days }) {
  const ref = useRef(null)
  const pace = goalPace(goal)
  const tone = pace ? `${pace.tone}${pace.lagWeeks}` : ''
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const check = () => {
      // Form 3 first: the line as it was. Where it wraps (narrow cards), forms 1 and 2 keep its height, so the card
      // never changes height.
      el.dataset.form = '3'
      el.style.minHeight = ''
      if (!tone) return
      const h3 = el.getBoundingClientRect().height // unrounded, so the card keeps its exact height
      for (const form of ['1', '2']) {
        el.dataset.form = form
        el.style.minHeight = `${h3}px`
        if (el.scrollWidth <= el.clientWidth) return
      }
      el.dataset.form = '3'
      el.style.minHeight = ''
    }
    check()
    const row = el.closest('.top')
    if (!row || typeof ResizeObserver !== 'function') return undefined
    const ro = new ResizeObserver(check)
    ro.observe(row)
    return () => ro.disconnect()
  }, [date, days, tone])
  return <div ref={ref} className="t2 dl">{date}<span className="dl-days"> · {days}</span><GoalDotLabel goal={goal} /></div>
}

// The goal card's Add button with its small caption (v1.0.8, display only). The caption shows only when it fits on one
// line and "Add {nim} NIM" stays on one line; otherwise cap-off hides it and the button is exactly as before (same
// 46 px). Checked before paint and again when the button's width changes.
function AddButton({ label, caption, onClick }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !caption) return undefined
    const check = () => {
      el.classList.remove('cap-off')
      const main = el.firstElementChild
      const small = el.querySelector('small')
      const lh = parseFloat(getComputedStyle(main).lineHeight) || 16
      const fits = main.offsetHeight <= lh * 1.5 && small.scrollWidth <= small.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1
      el.classList.toggle('cap-off', !fits)
    }
    check()
    if (typeof ResizeObserver !== 'function') return undefined
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [label, caption])
  if (!caption) return <button type="button" className="btn" onClick={onClick}>{label}</button>
  return <button type="button" ref={ref} className="btn cap" onClick={onClick}><span>{label}</span><small>{caption}</small></button>
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
