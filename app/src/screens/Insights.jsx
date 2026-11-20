import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { listGoals } from '../lib/goals.js'
import { insights } from '../lib/insights.js'
import { DayGrid, GoalsSideBySide, WeeklyCard, WeeksRow } from '../components/InsightsParts.jsx'

// Insights (route 'insights'): your saving, computed from the deposits on this phone. Back returns to Savings.
// Display only: no chain read, no network, no write.
export default function Insights() {
  const { t, address, back, canGoBack, reset } = useApp()
  const goals = listGoals(address)
  const data = insights(goals, Date.now())
  const onBack = canGoBack ? back : () => reset('stake')
  return (
    <>
      <Header onBack={onBack} />
      <main className="screen">
        <h2 className="title">{t('ins_title')}</h2>
        <p className="sub">{t('ins_sub')}</p>
        <WeeklyCard data={data} />
        <WeeksRow data={data} />
        {/* Part 2 adds the "Personal bests" card here. */}
        <GoalsSideBySide goals={goals} />
        <DayGrid days={data.days} />
        {/* Part 2 adds the "Share my {month}" button here. */}
        <p className="small ins-note">{t('ins_note')}</p>
      </main>
    </>
  )
}
