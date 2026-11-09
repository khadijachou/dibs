import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { listGoals } from '../lib/goals.js'
import { buildTimeline, shortHash } from '../lib/history.js'
import { fmtDate, fmtNim } from '../lib/format.js'

const ICON = { deposit: '+', move: '⇄', unlock: '↧', withdraw: '↩', purchase: '✓' }
const STEP = { deactivate: 'unlock_s1', retire: 'unlock_s2', remove: 'unlock_s3' }

export default function History() {
  const { t, lang, address, toast } = useApp()
  const events = buildTimeline(listGoals(address))

  const title = (e) => {
    if (e.type === 'deposit') return t('hist_deposit')
    if (e.type === 'move') return t('hist_move', { from: e.from, to: e.to })
    if (e.type === 'unlock') return t('hist_unlock', { step: t(STEP[e.step] || 'unlock_s1') })
    if (e.type === 'withdraw') return t('hist_withdraw')
    return t('hist_purchase')
  }
  // No explorer link in the app yet: show the short hash, tap copies the full one.
  const copy = (h) => { navigator.clipboard?.writeText(h); toast(t('err_copied')) }

  return (
    <>
      <Header />
      <main className="screen">
        <h2 className="title">{t('tab_history')}</h2>
        {events.length === 0 ? (
          <p className="sub">{t('hist_empty')}</p>
        ) : (
          <ol className="timeline">
            {events.map((e) => (
              <li key={e.id} className={`tl-row ${e.type}`}>
                <span className="tl-ic" aria-hidden="true">{ICON[e.type]}</span>
                <div className="tl-main">
                  <b>{title(e)}</b>
                  {e.type !== 'move' && <span className="tl-goal">{e.goal}</span>}
                  <span className="tl-meta">
                    {fmtDate(e.at, lang)}
                    {e.tx && <button type="button" className="tl-tx" aria-label={t('hist_copy_tx')} onClick={() => copy(e.tx)}>{shortHash(e.tx)}</button>}
                  </span>
                </div>
                <span className="tl-amt">{e.type === 'deposit' ? '+' : ''}{fmtNim(e.nim, lang)} NIM</span>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  )
}
