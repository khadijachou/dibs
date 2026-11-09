import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header, Notice } from '../components/ui.jsx'
import { listGoals, savedNim } from '../lib/goals.js'
import { readStaker } from '../lib/nimiq.js'
import { stakeSummary } from '../lib/earned.js'
import { poolName } from '../lib/pace.js'
import { fmtNim } from '../lib/format.js'
import { goalBrand } from './Home.jsx'
import { chainReleaseAt, ReleaseClock } from '../components/ReleaseClock.jsx'

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

  const unlocking = listGoals(address).filter((g) => g.status === 'unlocking')

  let body
  if (state.status === 'down') {
    body = <Notice tone="info" title={t('err_NET_RPC_DOWN_title')} sub={t('err_NET_RPC_DOWN_sub')} actions={[{ label: t('err_NET_RPC_DOWN_action'), onClick: load }]} />
  } else if (state.status === 'loading') {
    body = <Notice tone="wait" title={t('stake_reading')} />
  } else {
    const st = state.staker
    const { total, earned } = stakeSummary(st, address)
    body = (
      <>
        <section className="hero stake-hero">
          <span className="small">{t('stake_total')}</span>
          <div className="n">{fmtNim(total, lang)} NIM</div>
          <div className="stake-facts">
            <div><span>{t('stake_validator')}</span><b><i className="dot" aria-hidden="true" />{poolName()}</b></div>
            <div><span>{t('stake_earned')}</span><b className="mint">+{fmtNim(earned, lang)} NIM</b></div>
          </div>
        </section>
        {!st && <p className="small">{t('stake_none')}</p>}
        {unlocking.map((g) => <UnstakingCard key={g.id} goal={g} chainAt={state.releaseAt} />)}
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

function UnstakingCard({ goal, chainAt }) {
  const { t, lang, go } = useApp()
  const withdraw = goal.unlockMode === 'withdraw'
  return (
    <section className="card unstake">
      <div className="unstake-top">
        <BrandLogo brand={goalBrand(goal)} />
        <div className="grow"><b>{goal.itemName} · {goal.itemDetail}</b><span className="small">{t('stake_unstaking', { nim: fmtNim(savedNim(goal), lang) })}</span></div>
      </div>
      <ReleaseClock goal={goal} chainAt={chainAt} />
      <button type="button" className={`btn small ${withdraw ? 'mint' : 'gold'}`} onClick={() => go('unlock', { goalId: goal.id, mode: withdraw ? 'withdraw' : undefined })}>{t('stake_open_unlock')}</button>
    </section>
  )
}
