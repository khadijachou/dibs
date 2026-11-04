import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { ErrorBox, Header, Ring } from '../components/ui.jsx'
import { addDeposit, getGoal, progress, savedNim, stakerFlag } from '../lib/goals.js'
import { describeError, getStaker, stakeNim } from '../lib/nimiq.js'
import { MIN_NEW_STAKER_NIM } from '../lib/config.js'
import { fmtDate, fmtNim, weeksUntil } from '../lib/format.js'

const parseNim = (v) => Math.floor(Number(String(v).replace(/[^\d.]/g, ''))) || 0

export default function Goal({ goalId, created }) {
  const { t, lang, address, balance, refreshBalance, back, canGoBack, go, reset } = useApp()
  const [goal, setGoal] = useState(() => getGoal(address, goalId))
  const [hasStaker, setHasStaker] = useState(() => stakerFlag.get(address))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const saved = goal ? savedNim(goal) : 0
  const remaining = goal ? Math.max(0, goal.targetNim - saved) : 0
  const suggested = goal ? Math.min(remaining, Math.ceil(goal.targetNim / weeksUntil(goal.deadline))) : 0
  const [amount, setAmount] = useState(() => String(Math.max(suggested, hasStaker ? 1 : MIN_NEW_STAKER_NIM)))

  useEffect(() => {
    getStaker(address).then((st) => { if (st) { setHasStaker(true); stakerFlag.set(address) } })
  }, [address])

  if (!goal) return null
  const reached = saved >= goal.targetNim
  const pct = progress(goal)
  const amountNim = parseNim(amount)
  const tooMuch = balance != null && balance > 0 && amountNim > balance
  // Quick picks scale with the goal: the weekly suggestion, a quarter of the target, everything left.
  const quick = [...new Set([suggested, Math.ceil(goal.targetNim / 4), remaining])]
    .filter((q) => q > 0 && q <= remaining)
    .map((q) => ({ value: q, label: q === remaining ? t('goal_rest') : fmtNim(q, lang) }))

  const add = async () => {
    setError(null)
    const nim = amountNim
    if (!nim || nim <= 0) return
    if (!hasStaker && nim < MIN_NEW_STAKER_NIM) { setError(new Error(t('goal_min'))); return }
    setBusy(true)
    try {
      const tx = await stakeNim({ nim, hasStaker })
      stakerFlag.set(address)
      setHasStaker(true)
      setGoal(addDeposit(address, goal.id, { nim, tx }))
      refreshBalance()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Header onBack={canGoBack ? back : () => reset('home')} />
      <main className="screen">
        {created && goal.deposits.length === 0 && <div className="dibs-band"><b>Dibs!</b><span>{t('goal_created')}</span></div>}
        <section className="card-dark goal-head">
          <div className="ring-wrap">
            <Ring value={pct} label={`${Math.round(pct * 100)}%`} track="#3b3845" color={pct >= 1 ? '#15896A' : '#E8482A'} />
            <div className="pct">{Math.round(pct * 100)}%</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="item" style={{ fontSize: 14 }}>{goal.itemName} · {goal.itemDetail}</span>
            <span style={{ fontSize: 22, fontWeight: 800 }}>{fmtNim(saved, lang)} NIM</span>
            <span style={{ fontSize: 14, color: '#C9CBE0' }}>{t('goal_of', { target: fmtNim(goal.targetNim, lang) })}</span>
            <span style={{ fontSize: 13, color: '#C9CBE0' }}>{fmtDate(goal.deadline, lang)}</span>
          </div>
        </section>

        {goal.status === 'saving' && !reached && (
          <section className="card">
            <label htmlFor="amt" className="sub">{t('goal_add_label')}</label>
            <div className="amount">
              <input id="amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span>NIM</span>
            </div>
            <div className="pills">
              {quick.map((q) => (
                <button type="button" key={q.value} className={`pill${amountNim === q.value ? ' on' : ''}`} onClick={() => setAmount(String(q.value))}>{q.label}</button>
              ))}
            </div>
            {balance > 0 && <p className="small">{t('goal_wallet', { nim: fmtNim(balance, lang) })}</p>}
            {tooMuch && <p className="small" style={{ color: 'var(--red)' }}>{t('goal_too_much')}</p>}
            {!hasStaker && <p className="small">{t('goal_min')}</p>}
          </section>
        )}

        {reached && goal.status === 'saving' && <div className="ok">{t('goal_reached')}</div>}
        {goal.status === 'ready' && <div className="ok">{t('goal_ready')}</div>}
        <ErrorBox error={error} />

        {goal.deposits.length > 0 && (
          <section className="card">
            <b>{t('goal_deposits')}</b>
            <div className="list">
              {goal.deposits.slice().reverse().map((d) => (
                <div className="row" key={d.tx + d.at}><span>+{fmtNim(d.nim, lang)} NIM</span><span>{fmtDate(d.at, lang)}</span></div>
              ))}
            </div>
          </section>
        )}

        <div className="bottom">
          {goal.status === 'saving' && !reached && (
            <button type="button" className="btn" disabled={busy || !amountNim} onClick={add}>{t('goal_add', { nim: fmtNim(amountNim, lang) })}</button>
          )}
          {(goal.status === 'unlocking' || (goal.status === 'saving' && reached)) && (
            <button type="button" className="btn gold" onClick={() => go('unlock', { goalId: goal.id })}>{t('goal_unlock')}</button>
          )}
          {goal.status === 'ready' && (
            <button type="button" className="btn gold" onClick={() => go('redeem', { goalId: goal.id })}>{t('goal_buy', { name: goal.itemName })}</button>
          )}
        </div>
      </main>
    </>
  )
}
