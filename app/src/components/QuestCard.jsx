import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { listGoals } from '../lib/goals.js'
import { checkQuest, currentDaily, dailyState, weeklyXp } from '../lib/quests.js'
import { XP_EVENT, dayKey } from '../lib/xp.js'
import { detailText } from '../lib/itemName.js'
import { fmtNim } from '../lib/format.js'
import { goalBrand } from '../screens/Home.jsx'
import DailyQuests from './DailyQuests.jsx'

// Profile, Quests section (v1.2.0): the section title, the Today card (daily quests), then the Quest of the week card.
// The weekly card is optional (hidden when no quest applies or its goal is gone); the daily card is always there.
const short = (t, g) => `${goalBrand(g).name} ${detailText(t, g, { short: true })}` // same name as WeekCard

// title: the section title (Profile's "Quests"); id: lets Home's strip scroll to it.
export default function QuestCard({ title = null, id = undefined }) {
  return (
    <section className="quest" id={id}>
      {title && <div className="sec-head"><h3>{title}</h3></div>}
      <DailyQuests />
      <WeekCard />
    </section>
  )
}

// Quest of the week card (round, week, new, two, days5). Optional; hidden when none applies or its goal is gone.
function WeekCard() {
  const { t, lang, address, go } = useApp()
  const read = () => checkQuest(listGoals(address))
  const [q, setQ] = useState(read)
  useEffect(() => {
    const on = () => setQ(read())
    const events = ['dibs:goals', XP_EVENT]
    events.forEach((e) => window.addEventListener(e, on))
    return () => events.forEach((e) => window.removeEventListener(e, on))
  }, [address]) // eslint-disable-line react-hooks/exhaustive-deps

  const { quest, state } = q
  if (!quest || !state || state.hidden) return null
  const goal = quest.goalId ? listGoals(address).find((g) => g.id === quest.goalId) : null
  const item = goal ? short(t, goal) : ''
  const amount = fmtNim(quest.amount || 0, lang)
  const category = quest.chip ? t(`chip_${quest.chip}`) : ''
  const name = t(`quest_${quest.id}`)
  const xp = weeklyXp(quest.id)
  const n = state.count ?? 0
  const text = state.done ? t('quest_next')
    : quest.id === 'round' ? t('quest_round_text', { item, from: quest.from, to: quest.to, amount })
    : quest.id === 'week' ? t('quest_week_text', { amount, item })
    : quest.id === 'two' ? t('quest_two_text', { n })
    : quest.id === 'days5' ? t('quest_days5_text', { n })
    : t('quest_new_text', { category })
  const action = state.done ? null
    : quest.id === 'new' ? <button type="button" className="btn quest-btn" onClick={() => go('catalog', { chip: quest.chip })}>{t('quest_browse', { category })}</button>
    : quest.id === 'days5' ? null
    : quest.id === 'two' ? <button type="button" className="btn quest-btn" onClick={() => go('stake')}>{t('quest_two_btn')}</button>
    : <button type="button" className="btn quest-btn" onClick={() => go('goal', { goalId: quest.goalId, mode: 'add', amount: quest.amount })}>{t('quest_add', { amount })}</button>

  return (
    <div className={`quest-card${state.done ? ' done' : ''}`}>
      <div className="quest-top">
        <span className="quest-meta">{state.done ? t('quest_done', { xp }) : t('quest_meta', { xp })}</span>
        {!state.done && <span className="quest-ends">{t('quest_ends')}</span>}
      </div>
      <b className="quest-name">{name}</b>
      <p className="quest-text">{text}</p>
      <div className="quest-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)} aria-label={name}>
        <i style={{ width: `${Math.round(state.progress * 100)}%` }} />
      </div>
      {action}
    </div>
  )
}

// Home's Quests strip: today's daily set (read only; nothing is picked or recorded here). null only before onboarding,
// when there is no set at all.
export function dailyStrip(goals, now = Date.now()) {
  let set = null
  try { set = JSON.parse(localStorage.getItem('dibs.daily')) } catch { set = null }
  if (!set || set.day !== dayKey(now)) return null
  const st = dailyState(set, goals, now)
  if (!st.total) return null
  return { doneCount: st.doneCount, total: st.total, full: st.full }
}

export function QuestStrip({ onOpen }) {
  const { t, address } = useApp()
  const [, redraw] = useState(0)
  useEffect(() => {
    const on = () => redraw((n) => n + 1)
    const id = setTimeout(on, 0)
    const events = ['dibs:goals', XP_EVENT]
    events.forEach((e) => window.addEventListener(e, on))
    return () => { clearTimeout(id); events.forEach((e) => window.removeEventListener(e, on)) }
  }, [address])
  const d = dailyStrip(listGoals(address))
  if (!d) return null
  const sub = d.full ? <small className="qs-done">{t('quest_strip_done')}</small> : <small>{t('quest_strip', { n: d.doneCount, total: d.total })}</small>
  return (
    <button type="button" className="sheet-row quest-strip" onClick={onOpen}>
      <span className="si qs-ic" aria-hidden="true"><StarIcon /></span>
      <span><b>{t('quests_title')}</b>{sub}</span>
      <span className="qs-bars" aria-hidden="true">
        {Array.from({ length: d.total }, (_, i) => <i key={i} className={i < d.doneCount ? 'on' : undefined} />)}
      </span>
      <span className="chev" aria-hidden="true">›</span>
    </button>
  )
}

const StarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.1l-5.62 2.96 1.07-6.27L2.9 9.4l6.3-.9z" />
  </svg>
)
