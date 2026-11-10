import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { itemLabel } from '../lib/itemName.js'
import { BrandLogo, Header, Notice } from '../components/ui.jsx'
import { listGoals, savedNim } from '../lib/goals.js'
import { readStaker } from '../lib/nimiq.js'
import { stakeSummary } from '../lib/earned.js'
import { stageOf } from '../lib/unlockStage.js'
import { poolName } from '../lib/pace.js'
import { fmtEarned, fmtNim } from '../lib/format.js'
import { goalBrand } from './Home.jsx'
import { chainReleaseAt, ReleaseClock } from '../components/ReleaseClock.jsx'
import WeekCard from '../components/WeekCard.jsx'
import QuestCard from '../components/QuestCard.jsx'

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
    const { total, earned, other } = stakeSummary(st, address)
    body = (
      <>
        <section className="hero stake-hero">
          <span className="small">{t('stake_total')}</span>
          <div className="n">{fmtNim(total, lang)} NIM</div>
          <div className="stake-facts">
            <div><span>{t('stake_validator')}</span><b><i className="dot" aria-hidden="true" />{poolName()}</b></div>
            {earned != null && <div><span>{t('stake_earned')}</span><b className="mint">{fmtEarned(earned, lang)} NIM</b></div>}
            {other >= 1 && <div><span>{t('stake_other')}</span><b>{fmtNim(Math.floor(other), lang)} NIM</b></div>}
          </div>
          {other >= 1 && <p className="small">{t('stake_other_note')}</p>}
        </section>
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
      <div className="unstake-top">
        <BrandLogo brand={goalBrand(goal)} />
        <div className="grow"><b>{itemLabel(t, goal)}</b><span className="small">{t('stake_unstaking', { nim: fmtNim(savedNim(goal), lang) })}</span></div>
      </div>
      <ReleaseClock goal={goal} chainAt={chainAt} retired={retired} />
      <button type="button" className={`btn small ${withdraw ? 'mint' : 'gold'}`} onClick={() => go('unlock', { goalId: goal.id, mode: withdraw ? 'withdraw' : undefined })}>{t('stake_open_unlock')}</button>
    </section>
  )
}
