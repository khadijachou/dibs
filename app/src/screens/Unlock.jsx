import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp, useBlockBack } from '../App.jsx'
import { itemName } from '../lib/itemName.js'
import { Header, Notice } from '../components/ui.jsx'
import { classify } from '../lib/errors.js'
import { getGoal, listGoals, savedNim, updateGoal } from '../lib/goals.js'
import { txOutcome } from '../lib/nimiq.js'
import { STEPS } from '../lib/unlockStage.js'
import { DONE, STEP_OF } from '../lib/unlock.js'
import { getUnlockState, sendUnlockStep, settleGoal } from '../lib/unlockFlow.js'
import { MIN_NEW_STAKER_NIM, toNim } from '../lib/config.js'
import { fmtNim } from '../lib/format.js'
import { leftText, readyTimeText, ReleaseClock, useStableReadyAt } from '../components/ReleaseClock.jsx'
import { UnlockTimer, usePageVisible } from '../components/UnlockTimer.jsx'
import { goalBrand } from './Home.jsx'
import { track } from '../lib/stats.js'
import { BLOCK_MS, clockOf, earliestStepBlockOf } from '../lib/release.js'

const LABELS = { deactivate: 'unlock_s1', retire: 'unlock_s2', remove: 'unlock_s3' }
// While the page is open the chain is read again this often (release switch, no reload).
const WATCH_MS = 30_000
const EXPLORER = 'https://nimiq.watch/#'

const hashOf = (tx) => (typeof tx === 'string' ? tx : tx?.hash || tx?.transactionHash || '')
const isCancel = (e) => e?.error?.type === 'PERMISSION_DENIED' || e?.type === 'PERMISSION_DENIED'
// "14:05" today, "9 Nov, 14:05" another day.
const whenText = (iso, lang) => {
  const d = new Date(iso)
  const today = d.toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat(lang, today ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}

// The step always comes from getUnlockState (lib/unlockFlow.js): a fresh chain read on open, on return to the
// page, every 30 s and after each send. Nothing saved locally can lock or skip a step; hashes are display only.
// mode 'withdraw': same three steps, but the goal ends 'withdrawn' (NIM back in the wallet, no card).
export default function Unlock({ goalId, mode: modeParam }) {
  const { t, lang, address, refreshBalance, back, reset, toast } = useApp()
  const [goal, setGoal] = useState(() => getGoal(address, goalId))
  const mode = modeParam || goal?.unlockMode || 'card'
  const withdraw = mode === 'withdraw'
  const [us, setUs] = useState(undefined) // getUnlockState result; undefined: not read yet
  const [rpcDown, setRpcDown] = useState(false)
  const [busy, setBusy] = useState(null) // null | 'sending' (Nimiq Pay open) | 'checking' (waiting for the tx outcome)
  const [notice, setNotice] = useState(null) // { kind: 'early' | 'refused' | 'unseen' | 'moved' | 'wallet' | 'error', ... }
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const check = useCallback(async () => {
    const g0 = getGoal(address, goalId)
    if (!g0) return null
    let read
    try { read = await getUnlockState(g0, address) } catch { if (alive.current) setRpcDown(true); return null }
    if (!alive.current) return null
    setRpcDown(false)
    setUs(read)
    const { goal: g, outcome } = settleGoal(address, getGoal(address, goalId), read)
    if (outcome) {
      track('unlock_step', { goalId: g.id, step: 'remove', mode: outcome === 'withdrawn' ? 'withdraw' : 'card' })
      refreshBalance()
      if (outcome === 'withdrawn') { toast(t('withdraw_done', { nim: fmtNim(savedNim(g0), lang) })); reset('home') } else reset('goal', { goalId: g.id })
      return read
    }
    setGoal(g)
    return read
  }, [address, goalId]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = usePageVisible()
  useEffect(() => {
    if (!visible || busy) return undefined
    check()
    const id = setInterval(check, WATCH_MS)
    return () => clearInterval(id)
  }, [check, visible, busy])
  // One extra read just after the estimated release, so the switch does not wait for the next 30 s read.
  const relAt = us?.state === 'waiting' ? us.releaseAt : null
  useEffect(() => {
    if (!visible || relAt == null) return undefined
    const ms = relAt - Date.now() + 2000
    if (ms <= 0 || ms > WATCH_MS) return undefined
    const id = setTimeout(check, ms)
    return () => clearTimeout(id)
  }, [check, relAt, visible])

  useBlockBack(busy === 'sending') // Android back waits while Nimiq Pay has the unlock step open

  // The release time shown on the timer card, the notice and the step button: one value for all three.
  const readyAt = useStableReadyAt(us?.releaseAt ?? null)

  if (!goal) return null
  const amount = savedNim(goal)
  const state = us?.state ?? null
  const current = state ? STEP_OF[state] : null
  const done = state ? DONE[state] : []
  const waiting = state === 'waiting'
  // Checks before step 1 of a withdraw: one release at a time, and the rest staked stays 0 or >= 100 NIM.
  const first = current === 'deactivate'
  const otherRelease = withdraw && first ? listGoals(address).find((g) => g.id !== goal.id && g.status === 'unlocking') : null
  const rest = us ? toNim(us.active) - amount : null
  // The chain holds less than this goal says (or no staker): the ledger and the stake disagree, send nothing.
  const mismatch = first && Boolean(us?.short)
  const underMin = withdraw && first && !mismatch && rest != null && rest > 0 && rest < MIN_NEW_STAKER_NIM
  const blocked = Boolean(otherRelease) || mismatch || underMin
  const relKnown = us?.releaseBlock != null
  const step1 = goal.unlockSteps.find((x) => x.step === 'deactivate')
  const startMs = step1 ? Date.parse(step1.at) : relKnown ? us.releaseAt - (us.releaseBlock - earliestStepBlockOf(us.inactiveFrom)) * BLOCK_MS : null
  const earlyText = (at) => {
    const clock = clockOf(at - Date.now())
    return clock.due ? `${t('err_UNL_NOT_RELEASED_title')}. ${t('stake_release_due')}.` : t('err_UNL_NOT_RELEASED_toast', { time: readyTimeText(at, lang), duration: leftText(t, clock) })
  }

  const run = async () => {
    const step = current
    if (!step || blocked || busy || waiting) return
    setNotice(null)
    setBusy('sending')
    let sent
    try {
      // Re-reads the chain first: Nimiq Pay opens only if this step is allowed right now.
      sent = await sendUnlockStep(goal, address, step)
    } catch (e) {
      setBusy(null)
      if (e?.gate) {
        const now = e.gate.us
        setUs(now)
        setNotice(now?.state === 'waiting' ? { kind: 'early', at: now.releaseAt } : { kind: 'moved' })
      } else if (isCancel(e)) {
        classify(e, 'unlock')
        toast(t('err_DEP_CANCELLED_toast'))
      } else {
        const key = classify(e, 'unlock')
        setNotice(key === 'UNL_WALLET_PENDING' ? { kind: 'wallet' } : { kind: 'error', key })
      }
      check()
      return
    }
    const g = updateGoal(address, goal.id, { status: 'unlocking', ...(withdraw ? { unlockMode: 'withdraw' } : {}) })
    if (g) setGoal(g)
    // A hash is not a success: wait for the tx on the chain and read its executionResult.
    setBusy('checking')
    const hash = hashOf(sent.tx)
    const outcome = await txOutcome(hash, { isCancelled: () => !alive.current })
    if (!alive.current) return
    if (outcome === 'ok') {
      const cur = getGoal(address, goal.id)
      const steps = [...(cur?.unlockSteps || []).filter((x) => x.step !== step), { step, tx: hash, at: new Date().toISOString() }]
      setGoal(updateGoal(address, goal.id, { unlockSteps: steps }) || cur)
      if (step !== 'remove') track('unlock_step', { goalId: goal.id, step, mode: withdraw ? 'withdraw' : 'card' })
    } else if (outcome === 'refused') {
      setNotice({ kind: 'refused', step })
    } else if (outcome === 'unknown') {
      setNotice({ kind: 'unseen', step })
    }
    setBusy(null)
    check()
  }

  const stepN = (s) => STEPS.indexOf(s) + 1
  const n = notice
  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <h2 className="title">{t(withdraw ? 'withdraw_title' : 'unlock_title')}</h2>
        <p className="sub">{t(withdraw ? 'withdraw_intro' : 'unlock_intro')}</p>
        {relKnown && startMs != null && <UnlockTimer brand={goalBrand(goal)} startMs={startMs} releaseMs={readyAt} released={state === 'ready'} />}
        <section className="card">
          <div className="row"><span className="sub">{itemName(t, goal, { title: true })}</span><b>{fmtNim(amount, lang)} NIM</b></div>
          <div className={`steps${withdraw ? ' mint' : ''}`}>
            {STEPS.map((s, i) => {
              const isDone = done.includes(s)
              const isNext = s === current
              const wait = isNext && waiting
              const rowState = isDone ? 'done' : wait ? 'wait' : isNext ? (busy === 'checking' ? 'current pending' : 'current') : ''
              const rec = isDone ? goal.unlockSteps.find((x) => x.step === s) : null
              const hash = rec && typeof rec.tx === 'string' ? rec.tx : ''
              return (
                <div key={s} className={`step ${rowState}`}>
                  <div className="n">{i + 1}</div>
                  <div className="step-txt">
                    <span style={{ fontWeight: 700 }}>{t(LABELS[s])}</span>
                    <span className="step-sub">
                      {isDone
                        ? <>{rec?.at ? t('unl_row_done_at', { time: whenText(rec.at, lang) }) : t('unl_row_done')}
                            {hash && <> · <a href={`${EXPLORER}${hash}`} target="_blank" rel="noopener noreferrer">{t('hist_view_tx')}</a></>}</>
                        : wait ? t('unl_row_wait', { left: leftText(t, clockOf(us.releaseAt - Date.now())) })
                        : isNext ? t(busy === 'checking' ? 'unl_row_checking' : 'unl_row_next')
                        : t('unl_row_after', { n: i })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
        {otherRelease && (
          <Notice tone="info" title={t('withdraw_busy_title')} sub={t('withdraw_busy_sub', { name: itemName(t, otherRelease, { title: true }) })} safe={t('safe_nimSafe')} />
        )}
        {!otherRelease && mismatch && <div className="band-warn">{t(withdraw ? 'withdraw_mismatch' : 'unl_no_stake')}</div>}
        {!otherRelease && underMin && (
          <div className="band-warn">
            {t('withdraw_under_min', { rest: fmtNim(rest, lang) })}
            <button type="button" className="nbtn pri" style={{ display: 'block', marginTop: 8 }} onClick={back}>{t('withdraw_move_action')}</button>
          </div>
        )}
        {rpcDown && (
          <Notice tone="info" title={t('err_NET_RPC_DOWN_title')} sub={t('err_NET_RPC_DOWN_sub')} actions={[{ label: t('err_NET_RPC_DOWN_action'), onClick: check }]} />
        )}
        {busy === 'checking' && <Notice tone="wait" title={t('unl_checking_title', { n: stepN(current || 'remove') })} sub={t('unl_checking_sub')} />}
        {n?.kind === 'early' && (
          <Notice tone="info" title={t('err_UNL_NOT_RELEASED_title')} sub={earlyText(n.at)} safe={t('safe_nothingSent')} />
        )}
        {n?.kind === 'refused' && (
          <Notice tone="info" title={t('unl_refused_title', { n: stepN(n.step) })}
            sub={`${t('unl_refused_chain')} ${t(n.step === 'retire' ? 'unl_refused_reason_release' : 'unl_refused_reason')}`} safe={t('safe_nimSafe')} />
        )}
        {n?.kind === 'unseen' && (
          <Notice tone="info" title={t('unl_unseen_title', { n: stepN(n.step) })} sub={t('unl_unseen_sub')} safe={t('safe_nimSafe')} />
        )}
        {n?.kind === 'moved' && <Notice tone="info" title={t('unl_moved_title')} sub={t('unl_moved_sub')} safe={t('safe_nothingSent')} />}
        {n?.kind === 'wallet' && (
          <Notice tone="info" title={t('err_UNL_WALLET_PENDING_title')} sub={t('err_UNL_WALLET_PENDING_sub')} safe={t('safe_nimSafe')}
            actions={[{ label: t('err_NET_RPC_DOWN_action'), onClick: () => { setNotice(null); check() } }]} />
        )}
        {n?.kind === 'error' && (n.key === 'UNL_NOT_RELEASED'
          ? <Notice tone="info" title={t('err_UNL_NOT_RELEASED_title')} sub={t('unlock_wait')} safe={t('err_UNL_VALIDATOR_JAILED_safe')} />
          : <Notice tone="info" title={t('err_GENERIC_title')} sub={t('err_GENERIC_sub')} safe={t('safe_nothingSent')} />)}
        {!n && !blocked && !busy && !relKnown && us && <p className="small">{t('unlock_wait')}</p>}
        {current === 'retire' && !relKnown && us && <section className="card unstake"><ReleaseClock goal={goal} chainAt={null} retired={false} /></section>}
        <div className="bottom">
          {current && (
            <button type="button" className={`btn ${waiting ? 'waiting' : withdraw ? 'mint' : 'gold'}`} disabled={Boolean(busy) || !us || blocked || waiting} onClick={run}>
              {waiting && readyAt != null ? t('unl_retire_wait', { time: readyTimeText(readyAt, lang) }) : t('unlock_go', { n: stepN(current) })}
            </button>
          )}
        </div>
      </main>
    </>
  )
}
