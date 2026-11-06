import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, ErrorBox, Header, Ring, WeekDots } from '../components/ui.jsx'
import { addDeposit, getGoal, progress, savedNim, stakedInGoals, stakerFlag } from '../lib/goals.js'
import { planOf, shortAddress } from '../lib/pace.js'
import { goalBrand, PaceLine } from './Home.jsx'
import { config, MIN_NEW_STAKER_NIM, toNim } from '../lib/config.js'
import { describeError, getStaker, stakeNim } from '../lib/nimiq.js'
import { fmtDate, fmtNim, weeksUntil } from '../lib/format.js'

const parseNim = (v) => Math.floor(Number(String(v).replace(/[^\d.]/g, ''))) || 0

// Known pools, by validator address.
const POOLS = { 'NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7': 'Garuda Pool' }


export default function Goal({ goalId, created, amount: preset }) {
  const { t, lang, address, balance, refreshBalance, back, canGoBack, go, reset } = useApp()
  const [goal, setGoal] = useState(() => getGoal(address, goalId))
  const [hasStaker, setHasStaker] = useState(() => stakerFlag.get(address))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)
  const [earned, setEarned] = useState(0)

  const saved = goal ? savedNim(goal) : 0
  const remaining = goal ? Math.max(0, goal.targetNim - saved) : 0
  const suggested = goal ? Math.min(remaining, Math.ceil(goal.targetNim / weeksUntil(goal.deadline))) : 0
  const [amount, setAmount] = useState(() => String(preset || Math.max(suggested, hasStaker ? 1 : MIN_NEW_STAKER_NIM)))

  useEffect(() => {
    getStaker(address).then((st) => {
      if (!st) return
      setHasStaker(true); stakerFlag.set(address)
      // Rewards = what the staker holds beyond what the goals put in (pool restakes rewards).
      const held = toNim((st.activeBalance ?? st.balance ?? 0) + (st.inactiveBalance ?? 0))
      setEarned(Math.max(0, Math.floor(held - stakedInGoals(address))))
    })
  }, [address])

  if (!goal) return null
  const reached = saved >= goal.targetNim
  const pct = progress(goal)
  const amountNim = parseNim(amount)
  const p = planOf(goal)
  const brand = goalBrand(goal)
  const pool = POOLS[config.defaultValidator] || shortAddress(config.defaultValidator) || 'Nimiq staking'
  const tooMuch = balance != null && balance > 0 && amountNim > balance
  // Quick picks scale with the goal: the weekly suggestion, a quarter of the target, everything left.
  const quick = [...new Set([suggested, Math.ceil(goal.targetNim / 4), remaining])]
    .filter((q) => q > 0 && q <= remaining)
    .map((q, i) => ({ value: q, label: q === remaining ? t('goal_rest') : i === 0 ? t('pill_week') : t('pill_quarter') }))

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
      setFlash({ nim, tx: String(tx?.hash || tx || '').slice(0, 6) })
      setTimeout(() => setFlash(null), 6000)
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
        {flash && (
          <div className="flash" role="status"><i>✓</i><div>{t('goal_added', { amount: fmtNim(flash.nim, lang) })}<small>{t('goal_added_sub', { tx: flash.tx + '…', pool })}</small></div></div>
        )}
        <section className="hero">
          <div className="top">
            <BrandLogo brand={brand} />
            <div><div className="t1">{goal.itemName} · {goal.itemDetail}</div><div className="t2">{fmtDate(goal.deadline, lang)} · {t(p.daysLeft === 1 ? 'days_left_one' : 'days_left_other', { count: p.daysLeft })}</div></div>
          </div>
          <div className="mid">
            <div className="ring-wrap">
              <Ring value={pct} size={100} label={`${Math.round(pct * 100)}%`} track="#35323f" color={pct >= 1 ? '#15896A' : '#E8482A'} />
              <div className="pct">{Math.round(pct * 100)}%</div>
            </div>
            <div>
              <div className="n">{fmtNim(saved, lang)} NIM</div>
              <div className="m">{t('goal_of2', { target: fmtNim(goal.targetNim, lang) })}<br />{t('goal_to_go', { amount: fmtNim(remaining, lang) })}</div>
              {(hasStaker || saved > 0) && <div className="earning">{earned > 0 ? t('goal_earning', { amount: fmtNim(earned, lang) }) : t('goal_earning_soon')}</div>}
            </div>
          </div>
          <WeekDots total={p.totalWeeks} done={p.weeksDone} now={p.weekIdx}
            left={t('weeks_done', { done: p.weeksDone, total: p.totalWeeks })}
            right={reached ? null : t('goal_this_week', { amount: fmtNim(Math.min(remaining, p.pace.amount || p.weekly), lang) })} />
          {saved > 0 && <div className="acct">{t('goal_account', { address: '' }).trim()} <b>{shortAddress(address)}</b><span className="pool">● {pool}</span></div>}
        </section>
        {goal.status === 'saving' && !reached && <PaceLine pace={p.pace} />}

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
            <div className="sec-head"><h3>{t('goal_deposits')}</h3><span className="small">{t('goal_count', { count: goal.deposits.length, total: fmtNim(saved, lang) })}</span></div>
            <div className="list">
              {goal.deposits.slice().reverse().map((d) => (
                <div className="row" key={d.tx + d.at}><span>+{fmtNim(d.nim, lang)} NIM</span><span>{fmtDate(d.at, lang)}</span></div>
              ))}
              {earned > 0 && <div className="row"><span style={{ color: 'var(--teal)' }}>{t('goal_earned_row', { amount: fmtNim(earned, lang) })}</span><span>{t('goal_since', { date: fmtDate(goal.deposits[0].at, lang) })}</span></div>}
            </div>
          </section>
        )}

        <div className="bottom">
          {goal.status === 'saving' && !reached && (
            <button type="button" className={`btn tall${p.pace.kind === 'ahead' && !flash ? ' ghost' : ''}`} disabled={busy || !amountNim || balance == null} onClick={add}>
              {p.pace.kind === 'ahead' && !flash ? t('goal_add_more') : t('goal_add', { nim: fmtNim(amountNim, lang) })}
              <small>{balance == null ? t('goal_waiting_balance') : t('confirm_hint')}</small>
            </button>
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
