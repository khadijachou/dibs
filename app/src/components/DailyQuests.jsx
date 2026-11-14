import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { listGoals } from '../lib/goals.js'
import { currentDaily, dailyState, markDailyShown } from '../lib/quests.js'
import { XP_EVENT } from '../lib/xp.js'
import { playMilestone, playTing } from '../lib/sound.js'
import { HEX } from './Badge.jsx'
import { goalBrand } from '../screens/Home.jsx'

// Profile > Quests > Today (v1.2.0): three daily quests, the same three all day. Slot 1 is the check-in (the daily-visit
// 5 XP, shown already done, no new XP). A row is a button that opens the place where the quest completes; the screen's
// own hook records it. All done: the rows become the "Day done" stamp. Everything is on the phone (lib/quests.js).
const DQ_XP = (id) => (id === 'add' ? 15 : 5)
const reducedMotion = () => { try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) } catch { return false } }

const TickIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)

// Done real quests (not the check-in) whose completion moment has not been shown yet.
const unshownKeys = ({ set, st }) => st.slots.filter((s) => s.done && s.id !== 'open' && !(set.shown || []).includes(s.key)).map((s) => s.key)

export default function DailyQuests() {
  const { t, lang, address, go } = useApp()
  const read = () => { const goals = listGoals(address); const set = currentDaily(goals); return { set, st: dailyState(set, goals) } }
  const [data, setData] = useState(read)
  const { set, st } = data
  useEffect(() => {
    const on = () => setData(read())
    const events = ['dibs:goals', XP_EVENT]
    events.forEach((e) => window.addEventListener(e, on))
    return () => events.forEach((e) => window.removeEventListener(e, on))
  }, [address]) // eslint-disable-line react-hooks/exhaustive-deps

  // The completion moment plays once per done quest, the first time the Today card shows it done (on this screen, or on
  // return from another screen). It is recorded in dibs.daily.shown (lib/quests.js), so it never replays, even after a
  // reload. A full day reached elsewhere holds the rows for the moment, then collapses into the Day done stamp.
  const pillRefs = useRef({})
  const started = useRef(new Set())
  const [just, setJust] = useState(() => new Set())
  const [holdRows, setHoldRows] = useState(() => !reducedMotion() && data.st.full && unshownKeys(data).length > 0)
  useEffect(() => {
    const fresh = unshownKeys(data).filter((k) => !started.current.has(k))
    if (!fresh.length) return
    fresh.forEach((k) => started.current.add(k))
    markDailyShown(fresh, listGoals(address)) // record now: shown once ever, even if a reload interrupts the animation
    if (reducedMotion()) return
    const full = st.full
    if (full) { setHoldRows(true); playMilestone() } else playTing() // one sound per moment
    setJust((s) => new Set([...s, ...fresh]))
    fresh.forEach((k) => setTimeout(() => flyPill(pillRefs.current[k]), 320))
    setTimeout(() => { setJust(new Set()); if (full) setHoldRows(false) }, full ? 1200 : 1100)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const showStamp = st.full && !holdRows

  const brandName = (goalId) => { const g = listGoals(address).find((x) => x.id === goalId); return g ? goalBrand(g).name : '' }
  const nameOf = (s) => s.id === 'open' ? t('dq_checkin')
    : s.id === 'savings' ? t('dq_savings')
    : s.id === 'catalog' ? t('dq_catalog')
    : s.id === 'category' ? t('dq_category', { category: t(`chip_${s.chip}`) })
    : s.id === 'goal' ? t('dq_goal', { brand: brandName(s.goalId) })
    : s.id === 'history' ? t('dq_history')
    : s.id === 'badges' ? t('dq_badges')
    : t('dq_add', { brand: brandName(s.goalId) })
  const openSlot = (s) => {
    if (s.id === 'savings') go('stake')
    else if (s.id === 'catalog') go('catalog')
    else if (s.id === 'category') go('catalog', { chip: s.chip })
    else if (s.id === 'goal') go('goal', { goalId: s.goalId, mode: 'details' })
    else if (s.id === 'history') go('history')
    else if (s.id === 'badges') go('profile', { section: 'badges', sectionAt: Date.now() })
    else if (s.id === 'add') go('goal', { goalId: s.goalId, mode: 'add' })
  }

  const xpToday = st.slots.filter((s) => s.done && s.id !== 'open').reduce((a, s) => a + DQ_XP(s.id), 0) + (st.full ? 5 : 0)

  return (
    <div className={`dq-card${showStamp ? ' full' : ''}`}>
      {showStamp ? (
        <>
          <div className="dq-done">
            <span className="dq-hex" aria-hidden="true">
              <svg viewBox="-1 -1 29 26" width="64"><path d={HEX} fill="#FFC94D" /><path d="M9.3 12.4l2.7 2.8 5.6-5.9" fill="none" stroke="#23212B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <div className="dq-done-tx">
              <span className="dq-over">{t('today')}</span>
              <b className="dq-done-h">{t('day_done')}</b>
              <span className="dq-done-xp">{t('xp_today', { xp: xpToday })}</span>
              <span className="dq-done-next">{t('next_quests')}</span>
            </div>
          </div>
          <ul className="dq-names">
            {st.slots.map((s) => <li key={s.key}><i className="dq-mini" aria-hidden="true"><TickIcon /></i>{nameOf(s)}</li>)}
          </ul>
        </>
      ) : (
        <>
          <div className="dq-top">
            <span className="dq-over">{t('today')}</span>
            <span className="dq-count">
              <span className="dq-bars" aria-hidden="true">{st.slots.map((s) => <i key={s.key} className={s.done ? 'on' : undefined} />)}</span>
              <b>{t('count', { n: st.doneCount, total: st.total })}</b>
            </span>
          </div>
          <ul className="dq-rows">
            {st.slots.map((s) => {
              const xp = <span ref={(el) => { pillRefs.current[s.key] = el }} className={`xp-pill dq-xp${s.done ? ' done' : ''}`}>{t('xp_plus', { n: DQ_XP(s.id) })}</span>
              const inner = (
                <>
                  <span className={`dq-tick${s.done ? ' on' : ''}${just.has(s.key) ? ' draw' : ''}`} aria-hidden="true">{s.done && <TickIcon />}</span>
                  <span className="dq-name">{nameOf(s)}</span>
                  {xp}
                  {!s.done && <svg className="dq-chev" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 1l6 6-6 6" /></svg>}
                </>
              )
              if (s.done || s.id === 'open') return <li key={s.key} className={`dq-row done${just.has(s.key) ? ' just' : ''}`}>{inner}</li>
              return <li key={s.key}><button type="button" className="dq-row" onClick={() => openSlot(s)}>{inner}</button></li>
            })}
          </ul>
          <p className="dq-foot">{t('footer')}</p>
        </>
      )}
    </div>
  )
}

// Sends a butter pill from a row up to the level bar, then flashes the bar. Transform and opacity only; best effort.
function flyPill(el) {
  try {
    const bar = document.querySelector('.lvl-bar')
    if (!el || !bar) return
    const a = el.getBoundingClientRect()
    const b = bar.getBoundingClientRect()
    if (!a.width || !b.width) return
    const fly = document.createElement('span')
    fly.className = 'dq-fly'
    fly.textContent = el.textContent
    fly.style.left = `${a.left}px`
    fly.style.top = `${a.top}px`
    fly.style.width = `${a.width}px`
    fly.style.height = `${a.height}px`
    document.body.appendChild(fly)
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2)
    const dy = (b.top + b.height / 2) - (a.top + a.height / 2)
    const anim = fly.animate(
      [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.7)`, opacity: 0 }],
      { duration: 600, easing: 'cubic-bezier(.2,.7,.2,1)' },
    )
    anim.onfinish = () => {
      fly.remove()
      bar.classList.add('xp-flash')
      setTimeout(() => bar.classList.remove('xp-flash'), 500)
    }
  } catch { /* animation is display only */ }
}
