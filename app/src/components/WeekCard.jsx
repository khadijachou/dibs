import { useApp } from '../App.jsx'
import { goalPace, goalState } from './GoalStatus.jsx'
import { goalBrand } from '../screens/Home.jsx'
import { progress } from '../lib/goals.js'
import { detailText } from '../lib/itemName.js'
import { fmtNim } from '../lib/format.js'
import { planOf } from '../lib/pace.js'

// Savings tab: This week, over every active goal. What to add this week across saving goals to stay on track, how
// many are on track / behind / late, and Next up: a goal ready to buy, then one at 100% waiting to unlock, then the
// saving goal closest to done (unlocking goals have their own card on this page). Display only.
export const goalShortName = (t, g) => `${goalBrand(g).name} ${detailText(t, g, { short: true })}`

function nextUp(goals) {
  const by = (s) => goals.filter((g) => goalState(g) === s)
  const ready = by('ready')[0]
  if (ready) return { goal: ready, kind: 'ready' }
  const reached = by('reached')[0]
  if (reached) return { goal: reached, kind: 'reached' }
  const closest = by('saving').sort((a, b) => progress(b) - progress(a))[0]
  return closest ? { goal: closest, kind: 'close' } : null
}

export default function WeekCard({ goals }) {
  const { t, lang, go } = useApp()
  const saving = goals.map((g) => ({ g, pace: goalPace(g) })).filter((x) => x.pace)
  const next = nextUp(goals)
  if (!saving.length && !next) return null
  const toAdd = saving.reduce((s, x) => s + (x.pace.plan.pace.kind === 'ahead' ? 0 : Math.ceil(x.pace.plan.pace.amount || 0)), 0)
  const count = (tone) => saving.filter((x) => x.pace.tone === tone).length
  // The Add button opens the goal furthest behind, with what it needs this week.
  const first = saving.filter((x) => x.pace.plan.pace.kind !== 'ahead')
    .sort((a, b) => b.pace.lagWeeks - a.pace.lagWeeks || (b.pace.plan.pace.amount || 0) - (a.pace.plan.pace.amount || 0))[0]
  const item = next ? goalShortName(t, next.goal) : ''
  const nextText = !next ? null
    : next.kind === 'ready' ? t('next_ready', { item })
    : next.kind === 'reached' ? t('next_reached', { item })
    : t('next_close', { item, pct: Math.round(progress(next.goal) * 100) })
  const nextLeft = next?.kind === 'close' ? t('next_close_left', { amount: fmtNim(planOf(next.goal).remaining, lang) }) : null
  return (
    <section className="wk">
      <div className="wk-card">
        <span className="stake-label">{t('week_title')}</span>
        {saving.length > 0 && (
          <div className="wk-top">
            <div className="wk-sum">
              {toAdd > 0 ? <><b>{fmtNim(toAdd, lang)} NIM</b><span>{t('week_add')}</span></> : <span className="wk-ahead">{t('week_ahead')}</span>}
            </div>
            {first && toAdd > 0 && (
              <button type="button" className="btn wk-btn" onClick={() => go('goal', { goalId: first.g.id, mode: 'add', amount: Math.max(1, Math.ceil(first.pace.plan.pace.amount)) })}>
                {t('week_add_to', { brand: goalBrand(first.g).name })}
              </button>
            )}
          </div>
        )}
        {saving.length > 0 && (
          <div className="wk-dots">
            {count('on') > 0 && <span><i className="goal-dot on" />{t('week_on', { n: count('on') })}</span>}
            {count('behind') > 0 && <span><i className="goal-dot behind" />{t('week_behind', { n: count('behind') })}</span>}
            {count('late') > 0 && <span><i className="goal-dot late" />{t('week_late', { n: count('late') })}</span>}
          </div>
        )}
        {nextText && (
          <button type="button" className="wk-next" onClick={() => go('goal', { goalId: next.goal.id, mode: 'details' })}>
            <small>{t('week_next')}</small>
            <span>{nextText}</span>
            {nextLeft && <span className="wk-left">{nextLeft}</span>}
            <span className="chev" aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </section>
  )
}
