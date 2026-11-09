import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header, Notice } from '../components/ui.jsx'
import { listGoals, savedNim, stakedInGoals } from '../lib/goals.js'
import { getBlockNumber, isDemo, readStaker } from '../lib/nimiq.js'
import { toNim } from '../lib/config.js'
import { poolName } from '../lib/pace.js'
import { fmtNim } from '../lib/format.js'
import { goalBrand } from './Home.jsx'

// Release timing (CLAUDE.md, measured on mainnet): staked NIM is released at the first block of the
// next epoch after inactiveFrom. Epochs are 43,200 blocks of about 1 s, aligned on multiples of 43,200.
const EPOCH = 43_200
const releaseBlockOf = (inactiveFrom) => (Math.floor(inactiveFrom / EPOCH) + 1) * EPOCH + 1
// When the chain gives no inactiveFrom (demo wallet), estimate from the deactivate step: 12 h 4 min, measured.
const FALLBACK_MS = (12 * 60 + 4) * 60_000

export default function Stake() {
  const { t, lang, address } = useApp()
  const [state, setState] = useState({ status: 'loading' }) // loading | down | ok
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    let st
    try { st = await readStaker(address) } catch { setState({ status: 'down' }); return }
    let releaseAt = null
    const from = Number(st?.inactiveFrom)
    if (st && from > 0 && Number(st.inactiveBalance) > 0) {
      try {
        const block = await getBlockNumber()
        releaseAt = Date.now() + Math.max(0, releaseBlockOf(from) - Number(block)) * 1000
      } catch { /* no block height: fall back to the step time below */ }
    }
    setState({ status: 'ok', staker: st, releaseAt })
  }, [address])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id) }, [])

  const unlocking = listGoals(address).filter((g) => g.status === 'unlocking')

  let body
  if (state.status === 'down') {
    body = <Notice tone="info" title={t('err_NET_RPC_DOWN_title')} sub={t('err_NET_RPC_DOWN_sub')} actions={[{ label: t('err_NET_RPC_DOWN_action'), onClick: load }]} />
  } else if (state.status === 'loading') {
    body = <Notice tone="wait" title={t('stake_reading')} />
  } else {
    const st = state.staker
    const total = st ? toNim(Number(st.balance ?? st.activeBalance ?? 0) + Number(st.inactiveBalance ?? 0) + Number(st.retiredBalance ?? 0)) : 0
    const earned = Math.max(0, Math.floor(total - stakedInGoals(address)))
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
        {unlocking.map((g) => <UnstakingCard key={g.id} goal={g} chainReleaseAt={state.releaseAt} now={now} />)}
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

function UnstakingCard({ goal, chainReleaseAt, now }) {
  const { t, lang, go } = useApp()
  const step = goal.unlockSteps.find((s) => s.step === 'deactivate')
  const retired = goal.unlockSteps.some((s) => s.step === 'retire')
  const est = chainReleaseAt ?? (step ? Date.parse(step.at) + FALLBACK_MS : null)
  const left = est == null ? null : Math.max(0, est - now)
  const h = left == null ? 0 : Math.floor(left / 3.6e6)
  const m = left == null ? 0 : Math.ceil((left % 3.6e6) / 60_000)
  const ready = retired || (left != null && left === 0)
  const withdraw = goal.unlockMode === 'withdraw'
  return (
    <section className="card unstake">
      <div className="unstake-top">
        <BrandLogo brand={goalBrand(goal)} />
        <div className="grow"><b>{goal.itemName} · {goal.itemDetail}</b><span className="small">{t('stake_unstaking', { nim: fmtNim(savedNim(goal), lang) })}</span></div>
      </div>
      {ready
        ? <div className="ok">{t('stake_released')}</div>
        : <div className="countdown-row"><span className="spin" aria-hidden="true" />{left == null ? t('stake_release_unknown') : t('stake_release_in', { h, m })}</div>}
      {isDemo() && !ready && chainReleaseAt == null && <p className="small">{t('stake_demo_estimate')}</p>}
      <button type="button" className={`btn small ${withdraw ? 'mint' : 'gold'}`} onClick={() => go('unlock', { goalId: goal.id, mode: withdraw ? 'withdraw' : undefined })}>{t('stake_open_unlock')}</button>
    </section>
  )
}
