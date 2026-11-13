import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { itemLabel } from '../lib/itemName.js'
import { BrandLogo, Header, Notice, useFiat } from '../components/ui.jsx'
import { listGoals, savedNim } from '../lib/goals.js'
import { readStaker } from '../lib/nimiq.js'
import { stakeSummary } from '../lib/earned.js'
import { stageOf } from '../lib/unlockStage.js'
import { poolName } from '../lib/pace.js'
import { fmtDateYear, fmtEarned, fmtNim } from '../lib/format.js'
import { fmtFiatValue } from '../lib/fiatValue.js'
import { goalBrand } from './Home.jsx'
import { chainReleaseAt, ReleaseClock } from '../components/ReleaseClock.jsx'
import WeekCard from '../components/WeekCard.jsx'
import QuestCard from '../components/QuestCard.jsx'
import { MIN_SHOWN, splitSegments, stakeSplit } from '../components/stakeSplit.js'

export default function Stake() {
  const { t, lang, address } = useApp()
  const [state, setState] = useState({ status: 'loading' }) // loading | down | ok

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    let st
    try { st = await readStaker(address) } catch { setState({ status: 'down' }); return }
    setState({ status: 'ok', staker: st, releaseAt: await chainReleaseAt(st) })
  }, [address])

  useEffect(() => { load() }, [load])

  const goals = listGoals(address)
  const unlocking = goals.filter((g) => g.status === 'unlocking')
  const active = goals.filter((g) => g.status !== 'redeemed' && g.status !== 'withdrawn')

  let body
  if (state.status === 'down') {
    body = <Notice tone="info" title={t('err_NET_RPC_DOWN_title')} sub={t('err_NET_RPC_DOWN_sub')} actions={[{ label: t('err_NET_RPC_DOWN_action'), onClick: load }]} />
  } else if (state.status === 'loading') {
    body = <Notice tone="wait" title={t('stake_reading')} />
  } else {
    const st = state.staker
    body = (
      <>
        {/* No staker at all: no top card, only the "Nothing staked yet" line. A stake that is only unlocking keeps it. */}
        {st && <StakeHero st={st} sum={stakeSummary(st, address)} />}
        {unlocking.map((g) => <UnstakingCard key={g.id} goal={g} chainAt={state.releaseAt} retired={stageOf(st, savedNim(g)).current === 'remove'} />)}
        {!st && <p className="small">{t('stake_none')}</p>}
        {active.length > 0 && <WeekCard goals={active} />}
        <QuestCard />
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="screen">
        <h2 className="title">{t('tab_stake')}</h2>
        {body}
        <p className="small stake-line">{t('stake_line')}</p>
      </main>
    </>
  )
}

function UnstakingCard({ goal, chainAt, retired }) {
  const { t, lang, go } = useApp()
  const withdraw = goal.unlockMode === 'withdraw'
  return (
    <section className="card unstake">
      <span className="stake-label">{t('stake_row_leaving')}</span>
      <div className="unstake-top">
        <BrandLogo brand={goalBrand(goal)} />
        <div className="grow"><b>{itemLabel(t, goal)}</b><span className="small">{t('stake_unstaking', { nim: fmtNim(savedNim(goal), lang) })}</span></div>
      </div>
      {/* Timer and button on one row when they fit, stacked when they do not (container query in theme-dark.css). */}
      <div className="unstake-act">
        <div className="unstake-clock"><ReleaseClock goal={goal} chainAt={chainAt} retired={retired} /></div>
        <button type="button" className={`btn small ${withdraw ? 'mint' : 'gold'}`} onClick={() => go('unlock', { goalId: goal.id, mode: withdraw ? 'withdraw' : undefined })}>{t('stake_open_unlock')}</button>
      </div>
    </section>
  )
}

// Top card: Total saved, the split bar and its rows, then Earned so far and Pool. Display only: every figure comes from
// stakeSummary() (lib/earned.js); the split only subtracts them (components/stakeSplit.js).
function StakeHero({ st, sum }) {
  const { t, lang } = useApp()
  const fiat = useFiat()
  const { total, earned, state: earnState, since } = sum
  const split = stakeSplit(sum)
  const value = st ? fmtFiatValue(total, fiat, lang) : null
  const rows = [
    { key: 'earning', label: t('stake_row_earning'), nim: split.earning, always: true },
    { key: 'outside', label: t('stake_row_other'), nim: split.outside, note: t('stake_row_other_note') },
    { key: 'unlocking', label: t('stake_row_leaving'), nim: split.unlocking, note: t('stake_row_leaving_note') },
  ].filter((r) => r.always || r.nim >= MIN_SHOWN)
  const segments = splitSegments(split)
  // Earned so far (lib/earnState.js): unknown shows a dash, nothing earned yet shows "First reward", stopped (all NIM
  // leaving) keeps the figure. With no stake at all there is no reward to wait for: the figure stays.
  const first = !!st && earned === 0 && earnState !== 'stopped'
  return (
    <section className="hero stake-hero">
      <span className="stake-label">{t('stake_total_saved')}</span>
      <div className="stake-total">
        <span className="n">{fmtNim(total, lang)} NIM</span>
        {value && <span className="stake-fiat">{value}</span>}
      </div>
      {st && (
        <>
          {segments.length > 0 && (
            <div className="stake-bar" aria-hidden="true">
              {segments.map((p) => <i key={p.key} className={`seg sp-${p.key}`} style={{ flexGrow: p.share }} />)}
            </div>
          )}
          <ul className="stake-rows">
            {rows.map((r) => (
              <li key={r.key} className={`sp-${r.key}`}>
                <i className="sq" aria-hidden="true" />
                <span className="lbl">{r.label}{r.note && <small>{r.note}</small>}</span>
                <b className="amt">{fmtNim(r.nim, lang)} NIM</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="stake-facts">
        <div>
          <span>{t('stake_earned')}</span>
          {earned == null ? <b>-</b>
            : first ? <><b className="first">{t('stake_first_reward')}</b><span>{t('stake_first_reward_sub')}</span></>
            : <><b className="mint">{fmtEarned(earned, lang)} NIM</b>{since && <span>{t('stake_since', { date: fmtDateYear(since, lang) })}</span>}</>}
        </div>
        <div>
          <span>{t('stake_pool')}</span>
          <b><i className="dot" aria-hidden="true" />{poolName()}</b>
          <span>{t('stake_pool_sub')}</span>
        </div>
      </div>
    </section>
  )
}
