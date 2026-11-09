import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { listGoals } from '../lib/goals.js'
import { profileStats } from '../lib/stats.js'
import { stakeSummary } from '../lib/earned.js'
import { readStaker } from '../lib/nimiq.js'
import { NAME_MAX, getName, setName } from '../lib/name.js'
import { fmtDateYear, fmtNim } from '../lib/format.js'

// Profile: a greeting and six numbers, all from data the app already has (goal ledger, staker, dibs.name).
export default function Profile() {
  const { t, lang, address, prices, reset } = useApp()
  const [name, setNameState] = useState(getName)
  const [editing, setEditing] = useState(false)
  // Earned from staking: the Stake tab's own figure. undefined while reading, null when the chain is unreadable.
  const [earned, setEarned] = useState(undefined)
  useEffect(() => {
    let live = true
    readStaker(address).then((st) => { if (live) setEarned(stakeSummary(st, address).earned) }).catch(() => { if (live) setEarned(null) })
    return () => { live = false }
  }, [address])

  const s = profileStats(listGoals(address))
  const empty = s.totalSaved === 0 && s.activeGoals === 0 && s.cardsBought === 0
  // Rounded to cents: a stat, not a price quote. Hidden while prices load and when nothing is saved.
  const usd = prices && s.totalSaved > 0 ? new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(s.totalSaved * prices.nimUsd) : null
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
          {!editing && (
            <button type="button" className="link-btn-inline" onClick={() => setEditing(true)}>{t(name ? 'prof_edit_name' : 'prof_add_name')}</button>
          )}
          {editing && <NameForm initial={name} onDone={(v) => { if (v !== undefined) setNameState(v); setEditing(false) }} />}
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

// The same dibs.name as onboarding and More > Settings. onDone(value) after Save, onDone() after Cancel.
function NameForm({ initial, onDone }) {
  const { t } = useApp()
  const [value, setValue] = useState(initial)
  const save = (e) => { e.preventDefault(); onDone(setName(value)) }
  return (
    <form className="prof-name" onSubmit={save}>
      <label htmlFor="prof-name" className="sr-only">{t('name_label')}</label>
      <input id="prof-name" className="name-input" type="text" autoComplete="given-name" autoCapitalize="words" autoFocus maxLength={NAME_MAX}
        placeholder={t('name_placeholder')} value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="prof-name-acts">
        <button type="submit" className="btn small">{t('prof_save')}</button>
        <button type="button" className="btn small ghost" onClick={() => onDone()}>{t('manage_cancel')}</button>
      </div>
      <p className="small">{t('name_device')}</p>
    </form>
  )
}
