// The staking pool picker (v1.5): the "Pool" row on the Add screen of a first deposit, and the "Choose a pool" sheet.
// Shown only on a first deposit (no staker). Garuda Pool is the default, and the deposit works exactly as before when
// the user never taps "Change".
import { useState } from 'react'
import { useApp } from '../App.jsx'
import { Sheet } from './ui.jsx'
import { checkedPool, DEFAULT_POOL, feeText, sameAddress } from '../lib/pools.js'

// "{fee} fee · pays every {n} hours": the fee part only when a fee is known, the hours part only when hours are known.
function metaLine(t, lang, pool) {
  const fee = feeText(pool.fee, lang)
  const parts = []
  if (fee) parts.push(t('pool_fee', { fee }))
  if (pool.hours != null) parts.push(t('pool_pays', { n: pool.hours }))
  return parts.join(' · ')
}

// The logo: an <img> from the already validated data URL (lib/pools.js validLogo), else a plain tile with the initial.
function PoolLogo({ pool }) {
  if (pool.logo) return <img className="pool-logo" src={pool.logo} alt="" width="34" height="34" />
  const initial = (pool.name || '?').trim().charAt(0).toUpperCase() || '?'
  return <span className="pool-logo pool-fallback" aria-hidden="true">{initial}</span>
}

// The default pool from baked data (no logo, no fee): shown while the list loads, or when it failed or lists only it.
const bakedDefault = () => { const d = checkedPool(DEFAULT_POOL); return { address: d.address, name: d.name, hours: d.hours, fee: null, logo: null } }

// pools: the pickable list, or null while it loads or after a failure. value: the current choice address.
// onChange(address): the parent saves it (setChoice) and reflects the new value. disabled: while a deposit is in flight.
export function PoolRow({ pools, value, onChange, disabled }) {
  const { t, lang } = useApp()
  const [open, setOpen] = useState(false)
  const loaded = Array.isArray(pools)
  const current = (loaded && pools.find((p) => sameAddress(p.address, value))) ||
    (checkedPool(value) ? { ...checkedPool(value), fee: null, logo: null } : bakedDefault())
  const canChange = loaded && pools.length >= 2 && !disabled
  return (
    <div className="pool-row">
      <PoolLogo pool={current} />
      <div className="pool-tx">
        <span className="pool-over">{t('stake_pool')}</span>
        <b className="pool-name">{current.name}</b>
        {metaLine(t, lang, current) && <span className="pool-sub">{metaLine(t, lang, current)}</span>}
      </div>
      {canChange && <button type="button" className="pool-change" onClick={() => setOpen(true)}>{t('accounts_change')}</button>}
      {open && <PoolSheet pools={pools} value={value} onClose={() => setOpen(false)} onUse={(a) => { onChange(a); setOpen(false) }} />}
    </div>
  )
}

// "Choose a pool": one row per pickable pool; selecting a row only moves the tick, "Use {pool}" saves and closes.
// Closing any other way changes nothing.
function PoolSheet({ pools, value, onClose, onUse }) {
  const { t, lang } = useApp()
  const [sel, setSel] = useState(value)
  const selected = pools.find((p) => sameAddress(p.address, sel)) || pools[0]
  return (
    <Sheet title={t('pool_pick_title')} onClose={onClose}>
      <p className="pool-lead">{t('pool_pick_lead')}</p>
      <div className="pool-opts" role="radiogroup" aria-label={t('pool_pick_title')}>
        {pools.map((p) => {
          const on = sameAddress(p.address, selected.address)
          return (
            <button type="button" key={p.address} className={`pool-opt${on ? ' on' : ''}`} role="radio" aria-checked={on} onClick={() => setSel(p.address)}>
              <PoolLogo pool={p} />
              <div className="pool-tx">
                <b className="pool-name">{p.name}</b>
                {metaLine(t, lang, p) && <span className="pool-sub">{metaLine(t, lang, p)}</span>}
              </div>
              <i className={`pool-tick${on ? ' on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</i>
            </button>
          )
        })}
      </div>
      <button type="button" className="btn tall" onClick={() => onUse(selected.address)}>{t('pool_use', { pool: selected.name })}</button>
      <p className="pool-note">{t('pool_pick_note')}</p>
    </Sheet>
  )
}
