import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { listGoals } from '../lib/goals.js'
import { checkQuest, questState } from '../lib/quests.js'
import { getQuestsDone, weekKey, XP_EVENT } from '../lib/xp.js'
import { detailText } from '../lib/itemName.js'
import { fmtNim } from '../lib/format.js'
import { goalBrand } from '../screens/Home.jsx'

// Profile, Quests section (v1.1.12, was on Savings): Quest of the week. Optional; +40 XP when done (lib/quests.js,
// lib/xp.js). No quest this week, or its goal is gone: no section.
const short = (t, g) => `${goalBrand(g).name} ${detailText(t, g, { short: true })}` // same name as WeekCard

// title: the section title shown above the card (Profile's "Quests"); id: lets Home's strip scroll to it.
export default function QuestCard({ title = null, id = undefined }) {
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
  const text = state.done ? t('quest_next')
    : quest.id === 'round' ? t('quest_round_text', { item, from: quest.from, to: quest.to, amount })
    : quest.id === 'week' ? t('quest_week_text', { amount, item })
    : t('quest_new_text', { category })
  const action = state.done ? null
    : quest.id === 'new' ? <button type="button" className="btn quest-btn" onClick={() => go('catalog', { chip: quest.chip })}>{t('quest_browse', { category })}</button>
    : <button type="button" className="btn quest-btn" onClick={() => go('goal', { goalId: quest.goalId, mode: 'add', amount: quest.amount })}>{t('quest_add', { amount })}</button>

  return (
    <section className="quest" id={id}>
      {title && <div className="sec-head"><h3>{title}</h3></div>}
      <div className={`quest-card${state.done ? ' done' : ''}`}>
        <div className="quest-top">
          <span className="quest-meta">{state.done ? t('quest_done') : t('quest_meta')}</span>
          {!state.done && <span className="quest-ends">{t('quest_ends')}</span>}
        </div>
        <b className="quest-name">{name}</b>
        <p className="quest-text">{text}</p>
        <div className="quest-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)} aria-label={name}>
          <i style={{ width: `${Math.round(state.progress * 100)}%` }} />
        </div>
        {action}
      </div>
    </section>
  )
}

// Home's Quests strip: this week's quest as lib/quests.js stored it (dibs.quest), read only. Nothing is picked or
// recorded here: App.jsx and the Profile card do that through checkQuest. null: no quest to show.
export function questProgress(goals, now = Date.now()) {
  let quest = null
  try { quest = JSON.parse(localStorage.getItem('dibs.quest')) } catch { quest = null }
  if (!quest || quest.week !== weekKey(now)) return null
  if (getQuestsDone().some((d) => d.week === quest.week)) return { done: true, pct: 100 }
  const st = questState(quest, goals, now)
  if (st.hidden) return null
  return { done: st.done, pct: Math.round(st.progress * 100) }
}

const StarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.1l-5.62 2.96 1.07-6.27L2.9 9.4l6.3-.9z" />
  </svg>
)

export function QuestStrip({ onOpen }) {
  const { t, address } = useApp()
  // Read on every render (one storage read): App.jsx may pick this week's quest just after Home first draws.
  const [, redraw] = useState(0)
  useEffect(() => {
    const on = () => redraw((n) => n + 1)
    const id = setTimeout(on, 0)
    const events = ['dibs:goals', XP_EVENT]
    events.forEach((e) => window.addEventListener(e, on))
    return () => { clearTimeout(id); events.forEach((e) => window.removeEventListener(e, on)) }
  }, [address])
  const q = questProgress(listGoals(address))
  if (!q) return null
  return (
    <button type="button" className="sheet-row quest-strip" onClick={onOpen}>
      <span className="si qs-ic" aria-hidden="true"><StarIcon /></span>
      <span><b>{t('quests_title')}</b><small>{q.done ? t('quest_strip_done') : t('quest_strip_pct', { pct: q.pct })}</small></span>
      <span className="chev" aria-hidden="true">›</span>
    </button>
  )
}
