import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp, useBlockBack } from '../App.jsx'
import { itemName } from '../lib/itemName.js'
import { Header, Notice } from '../components/ui.jsx'
import { classify } from '../lib/errors.js'
import { getGoal, listGoals, savedNim, updateGoal } from '../lib/goals.js'
import { readStaker, unlock } from '../lib/nimiq.js'
import { confirms, stageOf, STEPS } from '../lib/unlockStage.js'
import { MIN_NEW_STAKER_NIM, toNim } from '../lib/config.js'
import { fmtNim } from '../lib/format.js'
import { chainReleaseAt, ReleaseClock } from '../components/ReleaseClock.jsx'

const LABELS = { deactivate: 'unlock_s1', retire: 'unlock_s2', remove: 'unlock_s3' }
const POLL_MS = 3000
// How long a sent step may take to show on the chain before it counts as not accepted (blocks are ~1 s).
const CONFIRM_MS = 90_000

// readStaker sums `balance` (the chain's active stake); the demo staker calls it activeBalance.
const activeOf = (st) => toNim(st.balance ?? st.activeBalance ?? 0)
const hashOf = (tx) => (typeof tx === 'string' ? tx : tx?.hash || tx?.transactionHash || '')

// The steps come from the staker read (lib/unlockStage.js), never from saved flags. A sent step is kept as a
// pointer (goal.unlockPending) and only joins goal.unlockSteps once a later read confirms it.
// mode 'withdraw': same three steps, but the goal ends 'withdrawn' (NIM back in the wallet, no card).
export default function Unlock({ goalId, mode: modeParam }) {
  const { t, lang, address, refreshBalance, back, reset, toast } = useApp()
  const [goal, setGoal] = useState(() => getGoal(address, goalId))
  const mode = modeParam || goal?.unlockMode || 'card'
  const withdraw = mode === 'withdraw'
  const [st, setSt] = useState(undefined) // undefined: not read yet; null: no staker
  const [rpcDown, setRpcDown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [refused, setRefused] = useState(null) // step the chain did not show in time
  const [releaseAt, setReleaseAt] = useState(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  // Read the chain, then: confirm or expire a pending step, and drop saved steps the chain contradicts.
  const check = useCallback(async () => {
    let read
    try { read = await readStaker(address) } catch { if (alive.current) setRpcDown(true); return }
    if (!alive.current) return
    setRpcDown(false)
    setSt(read)
    chainReleaseAt(read).then((at) => { if (alive.current) setReleaseAt(at) }).catch(() => {})
    let g = getGoal(address, goalId)
    if (!g) return
    const amount = savedNim(g)
    const pend = g.unlockPending
    if (pend && confirms(pend, read, amount)) {
      const steps = [...g.unlockSteps.filter((x) => x.step !== pend.step), { step: pend.step, tx: pend.tx, at: pend.at }]
      if (pend.step === 'remove') {
        const at = new Date().toISOString()
        const patch = withdraw
          // The NIM left the staker: a ledger entry takes it out of the goal, so the goal holds 0.
          ? { unlockSteps: steps, unlockPending: null, unlockMode: 'withdraw', status: 'withdrawn', withdrawnAt: at, deposits: [...g.deposits, { id: crypto.randomUUID?.() || at, nim: -amount, kind: 'withdraw', at }] }
          : { unlockSteps: steps, unlockPending: null, status: 'ready' }
        updateGoal(address, g.id, patch)
        refreshBalance()
        if (withdraw) { toast(t('withdraw_done', { nim: fmtNim(amount, lang) })); reset('home') } else reset('goal', { goalId: g.id })
        return
      }
      g = updateGoal(address, g.id, { unlockSteps: steps, unlockPending: null })
    } else if (pend && Date.now() - Date.parse(pend.at) > CONFIRM_MS) {
      g = updateGoal(address, g.id, { unlockPending: null })
      setRefused(pend.step)
    } else if (!pend && g.status === 'unlocking') {
      // Saved steps the chain does not show never happened (e.g. a retire the chain refused): forget them.
      const { done } = stageOf(read, amount)
      const kept = g.unlockSteps.filter((x) => done.includes(x.step))
      if (kept.length !== g.unlockSteps.length) g = updateGoal(address, g.id, { unlockSteps: kept })
    }
    setGoal(g)
  }, [address, goalId, withdraw])

  // First read on open; while a step is pending, read again every few seconds until it shows or expires.
  const pendingAt = goal?.unlockPending?.at
  useEffect(() => {
    check()
    if (!pendingAt) return undefined
    const id = setInterval(check, POLL_MS)
    return () => clearInterval(id)
  }, [check, pendingAt])

  useBlockBack(busy) // Android back waits while Nimiq Pay has the unlock step open

  if (!goal) return null
  const amount = savedNim(goal)
  const pend = goal.unlockPending
  const stage = st === undefined ? null : stageOf(st, amount)
  const current = stage?.current ?? null
  const done = stage?.done ?? []
  const activeNow = st ? activeOf(st) : st === null ? 0 : null
  // Checks before step 1 of a withdraw: one release at a time, and the rest staked stays 0 or >= 100 NIM.
  const first = current === 'deactivate'
  const otherRelease = withdraw && first ? listGoals(address).find((g) => g.id !== goal.id && g.status === 'unlocking') : null
  const rest = activeNow == null ? null : activeNow - amount
  // The chain holds less than this goal says (or no staker): the ledger and the stake disagree, send nothing.
  const mismatch = (withdraw && first && rest != null && rest < 0) || Boolean(stage?.noStaker)
  const underMin = withdraw && first && rest != null && rest > 0 && rest < MIN_NEW_STAKER_NIM
  const blocked = Boolean(otherRelease) || mismatch || underMin

  const run = async () => {
    const step = current
    if (!step || blocked || busy || pend || !st) return
    setError(null); setRefused(null)
    setBusy(true)
    try {
      let tx
      if (step === 'deactivate') tx = await unlock.deactivate(Math.max(0, (activeNow ?? amount) - amount))
      if (step === 'retire') tx = await unlock.retire(amount)
      if (step === 'remove') tx = await unlock.remove(amount)
      // Sent is not done: keep a pointer and let the next staker reads confirm it.
      const pending = { step, tx: hashOf(tx) || tx, at: new Date().toISOString(), retiredBefore: Number(st.retiredBalance ?? 0) }
      setGoal(updateGoal(address, goal.id, { unlockPending: pending, status: 'unlocking', ...(withdraw ? { unlockMode: 'withdraw' } : {}) }))
    } catch (e) {
      const key = classify(e, 'unlock')
      if (e?.error?.type === 'PERMISSION_DENIED' || e?.type === 'PERMISSION_DENIED') toast(t('err_DEP_CANCELLED_toast'))
      else setError(key)
    } finally {
      setBusy(false)
    }
  }

  const stepN = (s) => STEPS.indexOf(s) + 1
  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <h2 className="title">{t(withdraw ? 'withdraw_title' : 'unlock_title')}</h2>
        <p className="sub">{t(withdraw ? 'withdraw_intro' : 'unlock_intro')}</p>
        <section className="card">
          <div className="row"><span className="sub">{itemName(t, goal, { title: true })}</span><b>{fmtNim(amount, lang)} NIM</b></div>
          <div className={`steps${withdraw ? ' mint' : ''}`}>
            {STEPS.map((s, i) => {
              const state = done.includes(s) ? 'done' : s === current ? (pend ? 'current pending' : 'current') : ''
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
          <Notice tone="info" title={t('withdraw_busy_title')} sub={t('withdraw_busy_sub', { name: itemName(t, otherRelease, { title: true }) })} safe={t('safe_nimSafe')} />
        )}
        {!otherRelease && mismatch && !stage?.noStaker && <div className="band-warn">{t('withdraw_mismatch')}</div>}
        {!otherRelease && underMin && (
          <div className="band-warn">
            {t('withdraw_under_min', { rest: fmtNim(rest, lang) })}
            <button type="button" className="nbtn pri" style={{ display: 'block', marginTop: 8 }} onClick={back}>{t('withdraw_move_action')}</button>
          </div>
        )}
        {rpcDown && (
          <Notice tone="info" title={t('err_NET_RPC_DOWN_title')} sub={t('err_NET_RPC_DOWN_sub')} actions={[{ label: t('err_NET_RPC_DOWN_action'), onClick: check }]} />
        )}
        {pend && <Notice tone="wait" title={t('unl_checking_title', { n: stepN(pend.step) })} sub={t('unl_checking_sub')} />}
        {refused && !pend && (
          <Notice tone="info" title={t('unl_refused_title', { n: stepN(refused) })} sub={t(refused === 'retire' ? 'unl_refused_sub_retire' : 'unl_refused_sub')} safe={t('safe_nimSafe')} />
        )}
        {!otherRelease && stage?.noStaker && <div className="band-warn">{t('unl_no_stake')}</div>}
        {error === 'UNL_NOT_RELEASED'
          ? <Notice tone="info" title={t('err_UNL_NOT_RELEASED_title')} sub={t('unlock_wait')} safe={t('err_UNL_VALIDATOR_JAILED_safe')} />
          : error ? <Notice tone="info" title={t('err_GENERIC_title')} sub={t('err_GENERIC_sub')} safe={t('safe_nothingSent')} />
          : !blocked && !pend && !refused && <p className="small">{t('unlock_wait')}</p>}
        {current === 'retire' && <section className="card unstake"><ReleaseClock goal={goal} chainAt={releaseAt} retired={false} /></section>}
        <div className="bottom">
          {current && (
            <button type="button" className={`btn ${withdraw ? 'mint' : 'gold'}`} disabled={busy || Boolean(pend) || !st || blocked} onClick={run}>
              {t('unlock_go', { n: stepN(current) })}
            </button>
          )}
        </div>
      </main>
    </>
  )
}
