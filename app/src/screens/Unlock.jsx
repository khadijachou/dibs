import { useEffect, useState } from 'react'
import { useApp, useBlockBack } from '../App.jsx'
import { Header, Notice } from '../components/ui.jsx'
import { classify } from '../lib/errors.js'
import { getGoal, listGoals, savedNim, stakedInGoals, updateGoal } from '../lib/goals.js'
import { getStaker, readStaker, unlock } from '../lib/nimiq.js'
import { MIN_NEW_STAKER_NIM, toNim } from '../lib/config.js'
import { fmtNim } from '../lib/format.js'
import { chainReleaseAt, ReleaseClock } from '../components/ReleaseClock.jsx'

const STEPS = ['deactivate', 'retire', 'remove']
const LABELS = { deactivate: 'unlock_s1', retire: 'unlock_s2', remove: 'unlock_s3' }

// readStaker sums `balance` (the chain's active stake); the demo staker calls it activeBalance.
const activeOf = (st) => toNim(st.balance ?? st.activeBalance ?? 0)

// mode 'withdraw': same three steps, but the goal ends 'withdrawn' (NIM back in the wallet, no card).
export default function Unlock({ goalId, mode: modeParam }) {
  const { t, lang, address, refreshBalance, back, reset, toast } = useApp()
  const [goal, setGoal] = useState(() => getGoal(address, goalId))
  const mode = modeParam || goal?.unlockMode || 'card'
  const withdraw = mode === 'withdraw'
  const [activeNow, setActiveNow] = useState(null)
  const [rpcDown, setRpcDown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (withdraw) {
      // Withdraw decides from the chain only: if it can't be read, wait.
      readStaker(address).then((st) => setActiveNow(st ? activeOf(st) : 0)).catch(() => setRpcDown(true))
      return
    }
    // Active stake from the chain when we can read it, else from our own ledger.
    getStaker(address).then((st) => {
      setActiveNow(st ? activeOf(st) : stakedInGoals(address))
    })
  }, [address, withdraw])

  // Release clock (display only): shown while step 1 is done and step 2 isn't. Reads the chain on its own,
  // so the steps, checks and money calls below are unchanged.
  const waiting = Boolean(goal) && goal.unlockSteps.some((s) => s.step === 'deactivate') && !goal.unlockSteps.some((s) => s.step === 'retire')
  const [releaseAt, setReleaseAt] = useState(null)
  useEffect(() => {
    if (!waiting) return
    let live = true
    readStaker(address).then(chainReleaseAt).then((at) => { if (live) setReleaseAt(at) }).catch(() => {})
    return () => { live = false }
  }, [address, waiting])

  useBlockBack(busy) // Android back waits while Nimiq Pay has the unlock step open

  if (!goal) return null
  const amount = savedNim(goal)
  const doneSteps = goal.unlockSteps.map((s) => s.step)
  const current = STEPS.find((s) => !doneSteps.includes(s))
  // Checks before step 1 of a withdraw: one release at a time, and the rest staked stays 0 or >= 100 NIM.
  const first = current === 'deactivate'
  const otherRelease = withdraw && first ? listGoals(address).find((g) => g.id !== goal.id && g.status === 'unlocking') : null
  const rest = activeNow == null ? null : activeNow - amount
  // The chain holds less than this goal says (or no staker): the ledger and the stake disagree, send nothing.
  const mismatch = withdraw && first && rest != null && rest < 0
  const underMin = withdraw && first && rest != null && rest > 0 && rest < MIN_NEW_STAKER_NIM
  const blocked = Boolean(otherRelease) || mismatch || underMin

  const run = async () => {
    if (blocked || busy) return
    setError(null)
    setBusy(true)
    try {
      let tx
      if (current === 'deactivate') tx = await unlock.deactivate(Math.max(0, (activeNow ?? amount) - amount))
      if (current === 'retire') tx = await unlock.retire(amount)
      if (current === 'remove') tx = await unlock.remove(amount)
      const steps = [...goal.unlockSteps, { step: current, tx, at: new Date().toISOString() }]
      const last = steps.length === STEPS.length
      const at = new Date().toISOString()
      const patch = withdraw
        ? (last
          // The NIM left the staker: a ledger entry takes it out of the goal, so the goal holds 0.
          ? { unlockSteps: steps, unlockMode: 'withdraw', status: 'withdrawn', withdrawnAt: at, deposits: [...goal.deposits, { id: crypto.randomUUID?.() || at, nim: -amount, kind: 'withdraw', at }] }
          : { unlockSteps: steps, unlockMode: 'withdraw', status: 'unlocking' })
        : { unlockSteps: steps, status: last ? 'ready' : 'unlocking' }
      const g = updateGoal(address, goal.id, patch)
      setGoal(g)
      if (last && withdraw) { refreshBalance(); toast(t('withdraw_done', { nim: fmtNim(amount, lang) })); reset('home') }
      else if (last) { refreshBalance(); reset('goal', { goalId: goal.id }) }
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
        <h2 className="title">{t(withdraw ? 'withdraw_title' : 'unlock_title')}</h2>
        <p className="sub">{t(withdraw ? 'withdraw_intro' : 'unlock_intro')}</p>
        <section className="card">
          <div className="row"><span className="sub">{goal.itemName}</span><b>{fmtNim(amount, lang)} NIM</b></div>
          <div className={`steps${withdraw ? ' mint' : ''}`}>
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
        {otherRelease && (
          <Notice tone="info" title={t('withdraw_busy_title')} sub={t('withdraw_busy_sub', { name: otherRelease.itemName })} safe={t('safe_nimSafe')} />
        )}
        {!otherRelease && mismatch && <div className="band-warn">{t('withdraw_mismatch')}</div>}
        {!otherRelease && underMin && (
          <div className="band-warn">
            {t('withdraw_under_min', { rest: fmtNim(rest, lang) })}
            <button type="button" className="nbtn pri" style={{ display: 'block', marginTop: 8 }} onClick={back}>{t('withdraw_move_action')}</button>
          </div>
        )}
        {rpcDown && (
          <Notice tone="info" title={t('err_NET_RPC_DOWN_title')} sub={t('err_NET_RPC_DOWN_sub')} />
        )}
        {error === 'UNL_NOT_RELEASED'
          ? <Notice tone="info" title={t('err_UNL_NOT_RELEASED_title')} sub={t('unlock_wait')} safe={t('err_UNL_VALIDATOR_JAILED_safe')} />
          : error ? <Notice tone="info" title={t('err_GENERIC_title')} sub={t('err_GENERIC_sub')} safe={t('safe_nothingSent')} />
          : !blocked && <p className="small">{t('unlock_wait')}</p>}
        {waiting && <section className="card unstake"><ReleaseClock goal={goal} chainAt={releaseAt} /></section>}
        <div className="bottom">
          {current && (
            <button type="button" className={`btn ${withdraw ? 'mint' : 'gold'}`} disabled={busy || activeNow == null || blocked} onClick={run}>
              {t('unlock_go', { n: STEPS.indexOf(current) + 1 })}
            </button>
          )}
        </div>
      </main>
    </>
  )
}
