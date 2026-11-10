import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp, useBlockBack } from '../App.jsx'
import { detailText, itemLabel, itemName, localName } from '../lib/itemName.js'
import { BrandLogo, FieldError, Header, Notice, Ring, Stamp, WeekDots } from '../components/ui.jsx'
import { classify, lastLogText } from '../lib/errors.js'
import { deletable, getGoal, listGoals, openGoalFor, progress, savedNim, stakerFlag, unlockRunning } from '../lib/goals.js'
import { planOf, poolName, shortAddress } from '../lib/pace.js'
import { goalBrand, PaceLine } from './Home.jsx'
import { MIN_NEW_STAKER_NIM } from '../lib/config.js'
import { readStaker, stakeNim } from '../lib/nimiq.js'
import { confirmPending, expired, pending, stakedLuna, startPending, waitForDeposit } from '../lib/deposit.js'
import { audioContext, playDeposit } from '../lib/sound.js'
import { fmtDate, fmtEarned, fmtNim, fmtUsd, weeksUntil } from '../lib/format.js'
import { findItem } from '../lib/catalog.js'
import { DeleteSheet, ManageSheet, MoveSheet } from './GoalManage.jsx'
import { useCountUp } from '../lib/useCountUp.js'
import { useDuplicateText } from '../components/useDuplicateText.js'
import { CardFlip, GiftFace, useCardFlip } from '../components/CardFlip.jsx'
import { CardIssue } from '../components/CardIssue.jsx'
import { goalCardIssue, payLockedFor } from '../lib/availability.js'
import { stakeSummary } from '../lib/earned.js'
import { track } from '../lib/stats.js'
import { txHash } from '../lib/history.js'
import { MilestoneLine, useGoalMilestone } from '../components/Milestone.jsx'
import { GoalDot, GoalStatus } from '../components/GoalStatus.jsx'
import { getUnlockState, settleGoal } from '../lib/unlockFlow.js'
import { readyTimeText } from '../components/ReleaseClock.jsx'

const parseNim = (v) => Math.floor(Number(String(v).replace(/[^\d.]/g, ''))) || 0

// The pay lock Redeem keeps while a payment's outcome is unknown. Read only.
// "A new goal" opens the Move sheet once, not again when this screen is revisited.
const movesOpened = new Set()




// mode: 'details' (hero, pace band, About this card, history) or 'add' (amount and the Add button).
// Without a mode: a new goal (created) opens on Add, anything else on Details.
export default function Goal({ goalId, created, amount: preset, moveFrom = null, mode: modeParam }) {
  const { t, lang, address, balance, refreshBalance, back, canGoBack, go, reset, toast } = useApp()
  const [goal, setGoal] = useState(() => getGoal(address, goalId))
  const [hasStaker, setHasStaker] = useState(() => stakerFlag.get(address))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null) // ErrorKey shown as a Notice
  const [slowWallet, setSlowWallet] = useState(false)
  const [flash, setFlash] = useState(null)
  const [earned, setEarned] = useState(0)
  const [earnedSince, setEarnedSince] = useState(null) // when Dibs started measuring rewards (not the first deposit)
  const [stakerAddress, setStakerAddress] = useState(null) // BUG-15: the account line shows the staker, not the funded address
  // BUG-01: a deposit waiting for the chain (survives reloads), and the outcomes it can end in.
  const [pend, setPend] = useState(() => pending.get(address))
  const [recovered, setRecovered] = useState(null) // { nim }: Nimiq Pay errored but the stake grew
  const [unseen, setUnseen] = useState(false)
  const [rpcDown, setRpcDown] = useState(false)
  // Manage: null | 'manage' | 'move' | 'delete'. moveFrom (from "A new goal") opens Move from that goal into this one.
  const [sheet, setSheet] = useState(null)
  const [moveSrc, setMoveSrc] = useState(() => {
    if (!moveFrom || movesOpened.has(goalId)) return null
    movesOpened.add(goalId)
    return getGoal(address, moveFrom)
  })
  const closeSheet = useCallback(() => setSheet(null), [])
  const closeMoveSrc = useCallback(() => setMoveSrc(null), [])
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const saved = goal ? savedNim(goal) : 0
  const remaining = goal ? Math.max(0, goal.targetNim - saved) : 0
  const savedShown = useCountUp(saved)
  const remainingShown = useCountUp(remaining)
  const suggested = goal ? Math.min(remaining, Math.ceil(goal.targetNim / weeksUntil(goal.deadline))) : 0
  const [amount, setAmount] = useState(() => String(preset || Math.max(suggested, hasStaker ? 1 : MIN_NEW_STAKER_NIM)))
  const mode = modeParam || (created ? 'add' : 'details')
  // Details -> Add reuses this screen: start the field from the preset or the weekly suggestion again.
  const lastMode = useRef(mode)
  useEffect(() => {
    if (lastMode.current === mode) return
    lastMode.current = mode
    if (mode === 'add') setAmount(String(preset || Math.max(suggested, hasStaker ? 1 : MIN_NEW_STAKER_NIM)))
  }, [mode, preset]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // The chain decides whether the next deposit opens a staker (E2 needs 100 NIM) or adds to it.
    readStaker(address).then((st) => {
      if (!st) { setHasStaker(false); return }
      setHasStaker(true); stakerFlag.set(address)
      setStakerAddress(st.address || null)
      const sum = stakeSummary(st, address)
      setEarned(sum.earned == null ? 0 : sum.byGoal[goalId] ?? 0) // this goal's share of Savings' figure; hidden when unknown
      setEarnedSince(sum.since)
    }).catch(() => { /* chain unreadable: keep the last known flag */ })
  }, [address, goalId])

  // Watches the pending deposit until the chain shows it or its deadline passes.
  // Runs on any goal screen, so reopening Dibs mid-deposit resumes here.
  useEffect(() => {
    if (!pend) return
    let stop = false
    waitForDeposit(pend, { address, untilMs: pend.deadline ?? pend.at + 10 * 60_000, isCancelled: () => stop || !alive.current }).then((r) => {
      if (stop || !alive.current) return
      const p = pending.get(address)
      if (!p || p.id !== pend.id) return
      if (r === 'landed') {
        const g = confirmPending(p, address)
        if (g) track('deposit', { goalId: p.goalId, depositId: p.id, nim: p.nim, tx: txHash(p.tx) || undefined })
        setPend(null)
        setHasStaker(true); stakerFlag.set(address)
        if (g && g.id === goalId) setGoal(g)
        if (p.walletError) setRecovered({ nim: p.nim })
        else if (p.goalId === goalId) {
          setFlash({ nim: p.nim, tx: String(p.tx || '').slice(0, 6) })
          if (g) playDeposit(Math.min(1, (savedNim(g) - p.nim) / g.targetNim), progress(g)) // one sound: 100 % > 25/50/75 % > clink
          setTimeout(() => alive.current && setFlash(null), 6000)
        }
        refreshBalance()
        return
      }
      // Nothing landed in time.
      if (!p.walletError && !expired(p)) { setPend({ ...p }); return } // poll again
      pending.clear()
      setPend(null)
      if (p.goalId !== goalId) return
      if (p.walletError === 'DEP_CANCELLED') toast(t('err_DEP_CANCELLED_toast'))
      else if (p.walletError) setProblem(p.walletError)
      else setUnseen(true)
    })
    return () => { stop = true }
  }, [pend, address, goalId])

  useEffect(() => {
    if (balance != null) { setSlowWallet(false); return }
    const id = setTimeout(() => setSlowWallet(true), 30000)
    return () => clearTimeout(id)
  }, [balance])

  const milestone = useGoalMilestone(goal)
  // Get my card: the card flips (display only), then the pay screen opens exactly as before.
  const flip = useCardFlip(() => go('redeem', { goalId }))
  useBlockBack(busy) // Android back waits while Nimiq Pay has the deposit open

  // Unlock resumes from the chain (E11): steps done in the Lab, an app closed half way, refused txs. The saved
  // status follows the chain, and Get my card stays disabled while the NIM is not released yet.
  const [unlockSt, setUnlockSt] = useState(null)
  // Another goal's unlock is running: this one cannot start its own (the chain state would be the other goal's).
  const otherUnlock = goal && goal.status === 'saving' ? unlockRunning(address, goal.id) : null
  const unlockable = Boolean(goal) && !otherUnlock && (goal.status === 'unlocking' || goal.status === 'ready' || (goal.status === 'saving' && saved >= goal.targetNim))
  useEffect(() => {
    if (!unlockable) { setUnlockSt(null); return undefined }
    let live = true
    const read = () => getUnlockState(getGoal(address, goalId), address).then((us) => {
      if (!live || !alive.current) return
      setUnlockSt(us)
      const { goal: g } = settleGoal(address, getGoal(address, goalId), us)
      if (g) setGoal(g)
    }).catch(() => { /* chain unreadable: the Unlock screen says so; no state guessed here */ })
    read()
    const id = setInterval(read, 60_000)
    return () => { live = false; clearInterval(id) }
  }, [address, goalId, unlockable, goal?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // An empty goal next to another open goal for the same card (a duplicate after a recovery): offer to delete it.
  const twin = goal && goal.status === 'saving' && saved === 0 ? openGoalFor(listGoals(address).filter((g) => g.id !== goal.id), goal.itemId) : null
  const twinText = useDuplicateText('merge', twin)

  if (!goal) return null
  const reached = saved >= goal.targetNim
  const pct = progress(goal)
  const amountNim = parseNim(amount)
  const p = planOf(goal)
  const brand = goalBrand(goal)
  const brandName = (goal.brandName || brand.name || '').replace(/ gift card$/i, '')
  // Week n of total: hidden once the goal is at 100 % or past saving (unlocking, ready, bought, withdrawn).
  const done100 = reached || goal.status !== 'saving'
  const pool = poolName()
  const tooMuch = balance != null && amountNim > balance
  // BUG-12: no staker yet and the wallet can't cover the 100 NIM first deposit. One message, no pills, button off.
  const cantOpen = !hasStaker && balance != null && balance < MIN_NEW_STAKER_NIM
  const underMin = !cantOpen && !hasStaker && amountNim > 0 && amountNim < MIN_NEW_STAKER_NIM
  const overBalance = !cantOpen && !underMin && tooMuch
  const invalid = !amountNim || tooMuch || underMin || cantOpen
  // Quick picks scale with the goal: the weekly suggestion, a quarter of the target, everything left.
  // Manage (⋯): saving goals, and any goal with 0 NIM and no unlock in progress (Delete). Only this goal's own
  // pending deposit or pay lock closes it.
  const canManage = (goal.status === 'saving' || deletable(goal)) && !(pend && pend.goalId === goal.id) && !payLockedFor(goal.id)
  const empty = goal.status === 'saving' && saved === 0 && (goal.deposits.length > 0 || Boolean(twin)) && canManage
  // Add only while there is something to add; a goal at 100 % or past saving shows Details.
  const adding = mode === 'add' && goal.status === 'saving' && !reached
  const withdraw = () => { setSheet(null); go('unlock', { goalId: goal.id, mode: 'withdraw' }) }
  const withdrawing = goal.status === 'unlocking' && goal.unlockMode === 'withdraw'
  const returned = goal.status === 'withdrawn' ? goal.deposits.filter((d) => d.kind === 'withdraw').reduce((s, d) => s - d.nim, 0) : 0
  const rowLabel = (d) => d.kind === 'move' ? t(d.to ? 'row_moved_to' : 'row_moved_from', { name: localName(t, d.name || '', { title: true }) }) : d.kind === 'withdraw' ? t('row_returned') : null
  const quick = [...new Set([suggested, Math.ceil(goal.targetNim / 4), remaining])]
    .filter((q) => q > 0 && q <= remaining)
    .map((q, i) => ({ value: q, label: q === remaining ? t('goal_rest') : i === 0 ? t('pill_week') : t('pill_quarter') }))

  // One tap = one transaction. The chain decides new staker vs add stake, and whether it worked.
  const add = async () => {
    audioContext() // inside the tap, before any await: unlocks the "NIM added" sound for when the deposit lands
    setProblem(null); setRecovered(null); setUnseen(false); setRpcDown(false)
    const nim = amountNim
    if (invalid || busy || pending.get(address)) return
    setBusy(true)
    let st
    try {
      st = await readStaker(address)
    } catch {
      setRpcDown(true); setBusy(false)
      return
    }
    const exists = Boolean(st)
    setHasStaker(exists)
    if (exists) stakerFlag.set(address)
    if (!exists && nim < MIN_NEW_STAKER_NIM) { setBusy(false); return } // E2 shows under the field
    const p = startPending({ address, goalId: goal.id, nim, beforeLuna: stakedLuna(st), newStaker: !exists })
    setPend(p)
    try {
      const tx = await stakeNim({ nim, hasStaker: exists })
      // Nimiq Pay sent it: wait for the chain, up to 10 minutes.
      pending.patch(address, { tx: String(tx?.hash || tx || ''), deadline: p.at + 10 * 60_000 })
    } catch (e) {
      const key = classify(e, 'deposit')
      // Even after an error, check the chain before saying anything: a cancel gets a short look,
      // any other error (Angelo's case) a longer one, during which the button stays locked.
      pending.patch(address, { walletError: key, deadline: Date.now() + (key === 'DEP_CANCELLED' ? 4000 : 45_000) })
    }
    setBusy(false)
    setPend(pending.get(address))
  }


  // Notices about a deposit in flight or just landed: shown on both Details and Add.
  const depositNotices = (
    <>
      {flash && (
        <div className="flash" role="status"><i>✓</i><div>{t('deposit_done', { amount: fmtNim(flash.nim, lang) })}{flash.tx && <small>{t('goal_added_sub', { tx: flash.tx + '…', pool })}</small>}</div></div>
      )}
      {recovered && (
        <Notice tone="info" title={t('deposit_recovered_title')} sub={t('deposit_recovered_body', { amount: fmtNim(recovered.nim, lang) })} safe={t('safe_nimSafe')} />
      )}
      {pend && pend.goalId === goal.id && pend.walletError !== 'DEP_CANCELLED' && (
        <Notice tone="wait" title={t('deposit_pending_title', { amount: fmtNim(pend.nim, lang) })} sub={t('deposit_pending_body')} />
      )}
      {unseen && <Notice tone="info" title={t('deposit_unseen_title')} sub={t('deposit_unseen_body')} />}
    </>
  )
  const problemNotices = (
    <>
      {slowWallet && (
        <Notice tone="wait" title={t('err_ENV_NO_CONSENSUS_title')} sub={t('err_ENV_NO_CONSENSUS_sub')}
          actions={[{ label: t('err_ENV_NO_CONSENSUS_action'), onClick: () => refreshBalance() }]} />
      )}
      {rpcDown && (
        <Notice tone="info" title={t('err_NET_RPC_DOWN_title')} sub={t('err_NET_RPC_DOWN_sub')}
          actions={[{ label: t('err_NET_RPC_DOWN_action'), onClick: () => add() }]} />
      )}
      {problem && (
        <Notice tone="info" title={t('err_GENERIC_title')} sub={t('err_GENERIC_sub')} safe={t('safe_nothingSent')}
          actions={[
            { label: t('err_GENERIC_action'), onClick: () => { setProblem(null); add() } },
            { label: t('err_GENERIC_action2'), onClick: () => { navigator.clipboard?.writeText(lastLogText()); toast(t('err_copied')) } },
          ]} />
      )}
    </>
  )
  const sheets = (
    <>
      {sheet === 'manage' && (
        <ManageSheet goal={goal} onClose={closeSheet}
          onMove={() => setSheet('move')}
          onWithdraw={withdraw}
          onDelete={() => setSheet('delete')} />
      )}
      {sheet === 'move' && <MoveSheet goal={goal} onClose={closeSheet} onMoved={(r) => { setGoal(r.from); setSheet(null) }} />}
      {sheet === 'delete' && <DeleteSheet goal={goal} onClose={closeSheet} />}
      {moveSrc && <MoveSheet goal={moveSrc} preselect={goal.id} onClose={closeMoveSrc} onMoved={(r) => { setGoal(r.to); setMoveSrc(null) }} />}
    </>
  )
  const onBack = canGoBack ? back : () => reset('home')
  const createdBand = created && goal.deposits.length === 0 && (
    <>
      <Stamp />
      <div className="dibs-band"><b>Dibs!</b><span>{t('goal_created')}</span></div>
    </>
  )

  // Add: a compact hero, the amount card and the Add button. The deposit itself is unchanged.
  if (adding) {
    return (
      <>
        <Header onBack={onBack} />
        <main className="screen">
          {createdBand}
          {depositNotices}
          <section className="hero add-hero">
            <div className="top">
              <BrandLogo brand={brand} />
              <div className="grow">
                <div className="t1">{itemLabel(t, goal)}</div>
                <div className="t2">{t('add_hero_line', { pct: Math.round(pct * 100), saved: fmtNim(Math.round(savedShown), lang), target: fmtNim(goal.targetNim, lang) })}</div>
              </div>
            </div>
          </section>

          <section className="card">
            <label htmlFor="amt" className="sub">{t('goal_add_label')}</label>
            <div className={`amount${cantOpen || underMin || tooMuch ? ' bad' : ''}`}>
              <input id="amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span>NIM</span>
            </div>
            {cantOpen ? (
              <>
                <FieldError>{t('err_DEP_NOT_ENOUGH_field', { amount: fmtNim(balance, lang) })}</FieldError>
                <p className="small">{t('err_DEP_NOT_ENOUGH_hint')}</p>
              </>
            ) : (
              <>
                {underMin && <FieldError>{t('err_DEP_FIRST_UNDER_MIN_field', { min: MIN_NEW_STAKER_NIM })}</FieldError>}
                {overBalance && <FieldError>{t('err_DEP_ABOVE_BALANCE_field', { nim: fmtNim(balance, lang) })}</FieldError>}
                <div className="pills">
                  {underMin && <button type="button" className="pill fix" onClick={() => setAmount(String(MIN_NEW_STAKER_NIM))}>{MIN_NEW_STAKER_NIM} NIM</button>}
                  {overBalance && balance >= (hasStaker ? 1 : MIN_NEW_STAKER_NIM) && <button type="button" className="pill fix" onClick={() => setAmount(String(Math.floor(balance)))}>{fmtNim(balance, lang)}</button>}
                  {quick.map((q) => (
                    <button type="button" key={q.value} className={`pill${amountNim === q.value ? ' on' : ''}`} onClick={() => setAmount(String(q.value))}>{q.label}</button>
                  ))}
                </div>
                <p className="small">{balance == null ? t('goal_reading') : t('goal_in_wallet', { amount: fmtNim(balance, lang) })}</p>
                {!hasStaker && !underMin && !tooMuch && <p className="small">{t('goal_first_note', { min: MIN_NEW_STAKER_NIM })}</p>}
              </>
            )}
          </section>
          {problemNotices}

          <div className="bottom">
            <button type="button" className={`btn tall${p.pace.kind === 'ahead' && !flash && !pend ? ' ghost' : ''}`} disabled={busy || !!pend || invalid || balance == null} onClick={add}>
              {pend ? t('deposit_button_waiting') : cantOpen ? t('goal_add_min', { min: MIN_NEW_STAKER_NIM }) : p.pace.kind === 'ahead' && !flash ? t('goal_add_more') : t('goal_add', { nim: fmtNim(amountNim, lang) })}
              {!pend && <small>{balance == null ? t('goal_waiting_balance') : cantOpen ? t('goal_add_min_sub', { amount: fmtNim(balance, lang) }) : t('confirm_hint')}</small>}
            </button>
          </div>
        </main>
        {sheets}
      </>
    )
  }

  // Details: the hero, the pace band, About this card, then the history. No amount field here.
  return (
    <>
      <Header onBack={onBack} />
      <main className="screen">
        {createdBand}
        {depositNotices}
        <CardFlip flip={flip} back={<GiftFace brand={brand} label={t('flip_gift')} title={t('flip_face', { brand: brandName, amount: detailText(t, goal, { short: true }) })} />}>
        <section className="hero">
          <div className="top">
            <BrandLogo brand={brand} />
            <div className="grow"><div className="t1">{itemLabel(t, goal)}</div><div className="t2">{fmtDate(goal.deadline, lang)} · {t(p.daysLeft === 1 ? 'days_left_one' : 'days_left_other', { count: p.daysLeft })}</div></div>
            {canManage && <button type="button" className="more-btn" aria-label={t('manage_btn')} aria-haspopup="dialog" onClick={() => setSheet('manage')}>⋯</button>}
          </div>
          <div className="mid">
            <div className={`ring-wrap${milestone ? ' ms-pulse' : ''}`}>
              <Ring value={pct} size={100} label={`${Math.round(pct * 100)}%`} track="#35323f" color={pct >= 1 ? '#15896A' : '#E8482A'} />
              <div className="pct">{Math.round(pct * 100)}%</div>
            </div>
            <div>
              <div className="n">{fmtNim(Math.round(savedShown), lang)} NIM</div>
              <div className="m">{t('goal_of2', { target: fmtNim(goal.targetNim, lang) })}<br />{t('goal_to_go', { amount: fmtNim(Math.round(remainingShown), lang) })}</div>
              <GoalStatus goal={goal} earned={earned} />
            </div>
          </div>
          <WeekDots total={p.totalWeeks} done={done100 && reached ? p.totalWeeks : p.weeksDone} now={p.weekIdx}
            left={done100 ? null : t('week_of', { n: Math.min(p.totalWeeks, p.weekIdx + 1), total: p.totalWeeks })}
            right={done100 ? null : t('goal_this_week', { amount: fmtNim(Math.min(remaining, p.pace.amount || p.weekly), lang) })} />
          <MilestoneLine milestone={milestone} />
          {saved > 0 && stakerAddress && <div className="acct">{t('goal_account', { address: '' }).trim()} <b>{shortAddress(stakerAddress)}</b><span className="pool">● {pool}</span></div>}
        </section>
        </CardFlip>
        {goal.status === 'saving' && !reached && (
          <PaceLine pace={p.pace} lagWeeks={p.lagWeeks} dot={<GoalDot goal={goal} inline />}>
            {p.pace.kind === 'late' && canManage && (
              <div className="band-acts">
                <button type="button" className="btn-sm" disabled={saved <= 0} onClick={() => setSheet('move')}>{t('late_move')}</button>
                {saved > 0
                  ? <button type="button" className="btn-sm" onClick={withdraw}>{t('manage_back')}</button>
                  : <button type="button" className="btn-sm" onClick={() => setSheet('delete')}>{t('manage_delete')}</button>}
              </div>
            )}
          </PaceLine>
        )}
        <AboutCard goal={goal} brand={brand} />
        <CardIssue goal={goal} />

        {reached && goal.status === 'saving' && <div className="ok">{t('goal_reached')}</div>}
        {goal.status === 'ready' && <div className="ok">{t('goal_ready')}</div>}
        {empty && (
          twin
            ? <Notice tone="info" title={twinText} actions={[{ label: t('change_exists_open'), onClick: () => go('goal', { goalId: twin.id }) }, { label: t('manage_delete'), onClick: () => setSheet('delete') }]} />
            : <div className="empty-row"><span>{t('goal_empty')}</span><button type="button" className="link-danger" onClick={() => setSheet('delete')}>{t('manage_delete')}</button></div>
        )}
        {goal.status === 'withdrawn' && (
          <>
            <div className="ok">{t('withdraw_returned_body', { nim: fmtNim(returned, lang), date: fmtDate(goal.withdrawnAt || goal.createdAt, lang) })}</div>
            <div className="empty-row"><span>{t('withdraw_returned')}</span><button type="button" className="link-danger" onClick={() => setSheet('delete')}>{t('manage_delete')}</button></div>
          </>
        )}
        {otherUnlock && reached && (
          <Notice tone="info" title={t('unlock_busy_title', { name: itemName(t, otherUnlock, { title: true }) })} sub={t('unlock_busy_sub')} safe={t('safe_nimSafe')}
            actions={[{ label: t('unlock_busy_action'), onClick: () => go('goal', { goalId: otherUnlock.id }) }]} />
        )}
        {problemNotices}

        {goal.deposits.length > 0 && (
          <section className="card">
            <div className="sec-head"><h3>{t('goal_deposits')}</h3><span className="small">{t('goal_count', { count: goal.deposits.filter((d) => !d.kind).length, total: fmtNim(saved, lang) })}</span></div>
            <div className="list">
              {goal.deposits.slice().reverse().map((d) => (
                <div className={`row${d.kind ? ' ' + d.kind : ''}`} key={(d.id || d.tx) + d.at}><span>{d.nim < 0 ? '−' : '+'}{fmtNim(Math.abs(d.nim), lang)} NIM{rowLabel(d) && <small className="row-note">{rowLabel(d)}</small>}</span><span>{Date.now() - Date.parse(d.at) < 60_000 ? t('goal_just_now') : fmtDate(d.at, lang)}</span></div>
              ))}
              {earned > 0 && <div className="row"><span style={{ color: 'var(--teal)' }}>{t('goal_earned_row', { amount: fmtEarned(earned, lang) })}</span><span>{t('goal_since', { date: fmtDate([goal.deposits[0].at, earnedSince].filter(Boolean).sort().at(-1), lang) })}</span></div>}
            </div>
          </section>
        )}

        <div className="bottom">
          {goal.status === 'saving' && !reached && (
            <button type="button" className="btn tall" onClick={() => go('goal', { goalId: goal.id, mode: 'add' })}>{t('goal_add_nim')}</button>
          )}
          {withdrawing && (
            <button type="button" className="btn mint" onClick={() => go('unlock', { goalId: goal.id, mode: 'withdraw' })}>{t('manage_back')}</button>
          )}
          {((goal.status === 'unlocking' && !withdrawing) || (goal.status === 'saving' && reached)) && (
            otherUnlock
              ? <button type="button" className="btn gold" disabled>{t('goal_unlock')}</button>
              : unlockSt?.state === 'waiting' && unlockSt.releaseAt != null
              ? <button type="button" className="btn waiting" disabled>{t('goal_card_ready_at', { time: readyTimeText(unlockSt.releaseAt, lang) })}</button>
              : <button type="button" className="btn gold" onClick={() => go('unlock', { goalId: goal.id })}>{t('goal_unlock')}</button>
          )}
          {goal.status === 'ready' && !goalCardIssue(goal) && (
            <button type="button" className="btn gold" onClick={flip.start}>{t('goal_buy', { name: itemName(t, goal) })}</button>
          )}
        </div>
      </main>
      {sheets}
    </>
  )
}

// About this card (Details): what the card is, where it works, how the shop delivers it, and its price under the
// same rule as the catalogue tiles (the live price, or "Price confirmed at checkout" when the shop gave none).
function AboutCard({ goal, brand }) {
  const { t, lang, toast } = useApp()
  const item = findItem(goal.itemId)
  const regions = (brand.region || []).map((r) => t(`region_${r}`))
  const region = regions.length > 1 ? t('region_join', { a: regions[0], b: regions[1] }) : regions[0]
  const estimated = item?.live === false
  return (
    <section className="card about-card">
      <h3>{t('about_title')}</h3>
      <p className="about-item">{itemLabel(t, goal)}</p>
      {(region || brand.delivers) && (
        <dl className="about-facts">
          {region && <div><dt>{t('about_region')}</dt><dd>{region}</dd></div>}
          {brand.delivers && <div><dt>{t('about_delivered')}</dt><dd>{t(`delivers_${brand.delivers}`)}</dd></div>}
        </dl>
      )}
      {brand.about && <p className="small">{t(brand.about)}</p>}
      {estimated ? (
        <button type="button" className="price-chip" onClick={() => toast(t('price_checkout_info'))}>
          <i aria-hidden="true">i</i>{t('price_checkout')}
        </button>
      ) : item?.usd != null && <p className="small about-price">{t('plan_price', { usd: fmtUsd(item.usd, lang) })}</p>}
    </section>
  )
}
