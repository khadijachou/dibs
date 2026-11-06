import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Notice } from '../components/ui.jsx'
import { classify } from '../lib/errors.js'
import { getGoal, savedNim, stakedInGoals, updateGoal } from '../lib/goals.js'
import { getStaker, unlock } from '../lib/nimiq.js'
import { toNim } from '../lib/config.js'
import { fmtNim } from '../lib/format.js'

const STEPS = ['deactivate', 'retire', 'remove']
const LABELS = { deactivate: 'unlock_s1', retire: 'unlock_s2', remove: 'unlock_s3' }

export default function Unlock({ goalId }) {
  const { t, lang, address, refreshBalance, back, reset, toast } = useApp()
  const [goal, setGoal] = useState(() => getGoal(address, goalId))
  const [activeNow, setActiveNow] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Active stake from the chain when we can read it, else from our own ledger.
    getStaker(address).then((st) => {
      setActiveNow(st && st.activeBalance != null ? toNim(st.activeBalance) : stakedInGoals(address))
    })
  }, [address])

  if (!goal) return null
  const amount = savedNim(goal)
  const doneSteps = goal.unlockSteps.map((s) => s.step)
  const current = STEPS.find((s) => !doneSteps.includes(s))

  const run = async () => {
    setError(null)
    setBusy(true)
    try {
      let tx
      if (current === 'deactivate') tx = await unlock.deactivate(Math.max(0, (activeNow ?? amount) - amount))
      if (current === 'retire') tx = await unlock.retire(amount)
      if (current === 'remove') tx = await unlock.remove(amount)
      const steps = [...goal.unlockSteps, { step: current, tx, at: new Date().toISOString() }]
      const last = steps.length === STEPS.length
      const g = updateGoal(address, goal.id, { unlockSteps: steps, status: last ? 'ready' : 'unlocking' })
      setGoal(g)
      if (last) { refreshBalance(); reset('goal', { goalId: goal.id }) }
    } catch (e) {
      const key = classify(e, 'unlock')
      if (e?.error?.type === 'PERMISSION_DENIED' || e?.type === 'PERMISSION_DENIED') toast(t('err_DEP_CANCELLED_toast'))
      else setError(key)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <h2 className="title">{t('unlock_title')}</h2>
        <p className="sub">{t('unlock_intro')}</p>
        <section className="card">
          <div className="row"><span className="sub">{goal.itemName}</span><b>{fmtNim(amount, lang)} NIM</b></div>
          <div className="steps">
            {STEPS.map((s, i) => {
              const state = doneSteps.includes(s) ? 'done' : s === current ? 'current' : ''
              return (
                <div key={s} className={`step ${state}`}>
                  <div className="n">{i + 1}</div>
                  <span style={{ fontWeight: 700 }}>{t(LABELS[s])}</span>
                </div>
              )
            })}
          </div>
        </section>
        {error === 'UNL_NOT_RELEASED'
          ? <Notice tone="info" title={t('err_UNL_NOT_RELEASED_title')} sub={t('unlock_wait')} safe={t('err_UNL_VALIDATOR_JAILED_safe')} />
          : error ? <Notice tone="info" title={t('err_GENERIC_title')} sub={t('err_GENERIC_sub')} safe={t('safe_nothingSent')} />
          : <p className="small">{t('unlock_wait')}</p>}
        <div className="bottom">
          {current && (
            <button type="button" className="btn gold" disabled={busy || activeNow == null} onClick={run}>
              {t('unlock_go', { n: STEPS.indexOf(current) + 1 })}
            </button>
          )}
        </div>
      </main>
    </>
  )
}
