import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { listGoals, progress, savedNim } from '../lib/goals.js'
import { fmtNim } from '../lib/format.js'

export default function Home() {
  const { t, lang, address, go } = useApp()
  const goals = listGoals(address)

  return (
    <>
      <Header />
      <main className="screen">
        <h2 className="title">{t('home_title')}</h2>
        {goals.length === 0 && <p className="sub">{t('home_empty')}</p>}
        {goals.map((g) => (
          <button type="button" key={g.id} className="goal-row" onClick={() => go(g.status === 'redeemed' ? 'done' : 'goal', { goalId: g.id })}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row"><b>{g.itemName}</b><span className="small">{g.itemDetail}</span></div>
              <div className={`bar${progress(g) >= 1 ? ' full' : ''}`}><i style={{ width: `${Math.round(progress(g) * 100)}%` }} /></div>
              <span className="small">{fmtNim(savedNim(g), lang)} / {fmtNim(g.targetNim, lang)} NIM</span>
            </div>
          </button>
        ))}
        <div className="bottom">
          <button type="button" className="btn" onClick={() => go('catalog')}>{t('home_new')}</button>
        </div>
      </main>
    </>
  )
}
