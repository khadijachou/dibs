import { useEffect } from 'react'
import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { listGoals } from '../lib/goals.js'
import { insights } from '../lib/insights.js'
import { markDailyOpen } from '../lib/quests.js'
import { DayGrid, GoalsSideBySide, PersonalBests, ShareMonthButton, WeeklyCard, WeeksRow } from '../components/InsightsParts.jsx'

// Insights (route 'insights'): your saving, computed from the deposits on this phone. Back returns to Savings.
// Display only: no chain read, no network, no write.
export default function Insights() {
  const { t, address, back, canGoBack, reset } = useApp()
  const goals = listGoals(address)
  const data = insights(goals, Date.now())
  useEffect(() => { markDailyOpen({ k: 'insights' }, listGoals(address)) }, [address]) // daily quest: Look at your Insights
  const onBack = canGoBack ? back : () => reset('stake')
  return (
    <>
      <Header onBack={onBack} />
      <main className="screen">
        <h2 className="title">{t('ins_title')}</h2>
        <p className="sub">{t('ins_sub')}</p>
        <WeeklyCard data={data} />
        <WeeksRow data={data} />
        <PersonalBests goals={goals} />
        <GoalsSideBySide goals={goals} />
        <DayGrid days={data.days} />
        <ShareMonthButton goals={goals} />
        <p className="small ins-note">{t('ins_note')}</p>
      </main>
    </>
  )
}
