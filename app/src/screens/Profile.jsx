import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { listGoals } from '../lib/goals.js'
import { profileStats } from '../lib/stats.js'
import { stakeSummary } from '../lib/earned.js'
import { readStaker } from '../lib/nimiq.js'
import { getName } from '../lib/name.js'
import { fmtDateYear, fmtNim, fmtUsd } from '../lib/format.js'

// Profile: a greeting and six numbers, all from data the app already has (goal ledger, staker, dibs.name).
export default function Profile() {
  const { t, lang, address, prices, reset } = useApp()
  const name = getName() // changed only in More > Settings
  // Earned from staking: the Stake tab's own figure. undefined while reading, null when the chain is unreadable.
  const [earned, setEarned] = useState(undefined)
  useEffect(() => {
    let live = true
    readStaker(address).then((st) => { if (live) setEarned(stakeSummary(st, address).earned) }).catch(() => { if (live) setEarned(null) })
    return () => { live = false }
  }, [address])

  const s = profileStats(listGoals(address))
  const empty = s.totalSaved === 0 && s.activeGoals === 0 && s.cardsBought === 0
  // Same USD format as everywhere (format.js). Hidden while prices load and when nothing is saved.
  const usd = prices && s.totalSaved > 0 ? fmtUsd(s.totalSaved * prices.nimUsd, lang) : null
  const earnedText = earned === undefined ? '…' : earned === null ? '-' : `+${fmtNim(earned, lang)}`

  const stats = [
    { label: t('prof_saved'), value: fmtNim(s.totalSaved, lang), unit: 'NIM', sub: usd && t('prof_usd', { usd }) },
    { label: t('prof_done'), value: s.goalsDone },
    { label: t('prof_cards'), value: s.cardsBought },
    { label: t('prof_earned'), value: earnedText, unit: earned != null ? 'NIM' : null, mint: earned > 0 },
    { label: t('prof_active'), value: s.activeGoals },
    { label: t('prof_since'), value: s.savingSince ? fmtDateYear(s.savingSince, lang) : '-', small: Boolean(s.savingSince) },
  ]

  return (
    <>
      <Header />
      <main className="screen">
        <section className="prof-head">
          <h2 className="title">{name ? t('home_hi', { name }) : t('prof_title_anon')}</h2>
          <p className="sub">{t('prof_intro')}</p>
        </section>

        <section className="prof-grid">
          {stats.map((x) => (
            <div className="prof-stat" key={x.label}>
              <b className={`${x.mint ? 'mint' : ''}${x.small ? ' date' : ''}`}>{x.value}{x.unit && <small> {x.unit}</small>}</b>
              <span>{x.label}</span>
              {x.sub && <em>{x.sub}</em>}
            </div>
          ))}
        </section>

        {empty && (
          <section className="prof-empty">
            <p>{t('prof_empty')}</p>
            <button type="button" className="btn" onClick={() => reset('home')}>{t('prof_empty_cta')}</button>
          </section>
        )}
      </main>
    </>
  )
}
