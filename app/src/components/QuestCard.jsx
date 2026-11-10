import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { listGoals } from '../lib/goals.js'
import { checkQuest } from '../lib/quests.js'
import { XP_EVENT } from '../lib/xp.js'
import { detailText } from '../lib/itemName.js'
import { fmtNim } from '../lib/format.js'
import { goalBrand } from '../screens/Home.jsx'

// Savings tab: Quest of the week, right after This week. Optional; +40 XP when done (lib/quests.js, lib/xp.js).
// No quest this week, or its goal is gone: no section.
const short = (t, g) => `${goalBrand(g).name} ${detailText(t, g, { short: true })}` // same name as WeekCard

export default function QuestCard() {
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
    <section className="quest">
      <div className="sec-head"><h3>{t('quest_title')}</h3></div>
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
