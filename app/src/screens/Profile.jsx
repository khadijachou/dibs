import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { listGoals } from '../lib/goals.js'
import { profileStats } from '../lib/profileStats.js'
import { stakeSummary } from '../lib/earned.js'
import { readStaker } from '../lib/nimiq.js'
import { getName } from '../lib/name.js'
import { fmtDateYear, fmtNim, fmtUsd } from '../lib/format.js'
import { poolName } from '../lib/pace.js'

// Profile: the name, a Total saved hero and four tiles, all from data the app already has (goal ledger, staker, dibs.name).
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
  // The pill under the total: what staking earned, or where the NIM is staked while nothing is earned yet.
  // None while the chain is being read or cannot be read, and none when nothing is saved.
  const pill = s.totalSaved > 0 && earned != null
    ? (earned > 0 ? t('prof_earned_pill', { amount: fmtNim(earned, lang) }) : t('prof_earning', { pool: poolName() }))
    : null

  const tiles = [
    { tone: 'coral', icon: 'target', label: t('prof_active'), value: s.activeGoals },
    { tone: 'mint', icon: 'check', label: t('prof_done'), value: s.goalsDone },
    { tone: 'butter', icon: 'gift', label: t('prof_cards'), value: s.cardsBought },
    { tone: 'cream', icon: 'calendar', label: t('prof_since'), value: s.savingSince ? fmtDateYear(s.savingSince, lang) : '-', date: true },
  ]

  return (
    <>
      <Header />
      <main className="screen">
        <section className="prof-head">
          <h2 className="title">{t('tab_profile')}</h2>
          {name && (
            <div className="prof-who">
              <span className="prof-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
              <span className="prof-name">{name}</span>
            </div>
          )}
          <p className="sub">{t('prof_intro')}</p>
        </section>

        <section className="prof-hero">
          <div className="prof-hero-head">
            <span className="prof-ic coral"><ProfIcon name="coins" /></span>
            <span>{t('prof_saved')}</span>
          </div>
          <b className="prof-total">{fmtNim(s.totalSaved, lang)}<small> NIM</small></b>
          {usd && <span className="prof-usd">{t('prof_usd', { usd })}</span>}
          {pill && <span className="prof-pill"><i aria-hidden="true" />{pill}</span>}
        </section>

        <section className="prof-tiles">
          {tiles.map((x) => (
            <div className={`prof-tile ${x.tone}`} key={x.icon}>
              <span className={`prof-ic ${x.tone}`}><ProfIcon name={x.icon} /></span>
              <b className={x.date ? 'date' : undefined}>{x.value}</b>
              <span className="prof-label">{x.label}</span>
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

// Profile icons: 24 x 24 strokes, drawn in the chip's colour.
const ICONS = {
  coins: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.8-5" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="2" /><path d="M4 13h16M12 9v11" /><path d="M12 9c-1.5-3.5-5-4-5-1.5S10 9 12 9zM12 9c1.5-3.5 5-4 5-1.5S14 9 12 9z" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
}
function ProfIcon({ name }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}
