import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { getGoal } from '../lib/goals.js'
import { api } from '../lib/api.js'
import { config } from '../lib/config.js'
import { isDemo } from '../lib/nimiq.js'

// Bitrefill invoice statuses, in order. Anything else shows as "waiting".
const STEPS = ['created', 'payment_detected', 'payment_confirmed', 'complete']

export default function Done({ goalId }) {
  const { t, address, reset } = useApp()
  const goal = getGoal(address, goalId)
  const orderId = goal?.payment?.orderId
  const [code, setCode] = useState(null)
  const [status, setStatus] = useState(null)
  const [show, setShow] = useState(false)

  // Polls our server until Bitrefill delivers the code. The code lives in memory only.
  useEffect(() => {
    if (config.redeemMode !== 'api' || !orderId) return
    if (isDemo()) { const id = setTimeout(() => { setStatus('complete'); setCode('DEMO-CODE-0000') }, 3000); return () => clearTimeout(id) }
    let stop = false
    const tick = async () => {
      try {
        const o = await api.order(orderId)
        setStatus(o.status)
        if (o.code) { setCode(o.code); return }
      } catch { /* retry */ }
      if (!stop) setTimeout(tick, 5000)
    }
    tick()
    return () => { stop = true }
  }, [orderId])

  if (!goal) return null
  const stepIdx = Math.max(0, STEPS.indexOf(status))
  return (
    <>
      <Header />
      <main className="screen">
        <div className="dibs-band">
          <b>Dibs!</b>
          <span>{code ? t('done_title') : t('done_paid')}</span>
          <span style={{ opacity: 0.9 }}>{goal.itemName} · {goal.itemDetail}</span>
        </div>

        {config.redeemMode === 'api' && orderId ? (
          <section className="card-dark" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <b>{t('done_code')}</b>
            <div className="code-box">{code ? (show ? code : '•••• •••• ••••') : t('done_waiting')}</div>
            {!code && <p className="small" style={{ color: 'var(--ground)', opacity: 0.8 }}>{t(`done_s${stepIdx}`)}</p>}
            {code && (
              <div className="pills">
                <button type="button" className="btn ghost small" style={{ flex: 1 }} onClick={() => setShow(!show)}>{show ? t('done_hide') : t('done_show')}</button>
                <button type="button" className="btn ghost small" style={{ flex: 1 }} onClick={() => navigator.clipboard?.writeText(code)}>{t('done_copy')}</button>
              </div>
            )}
          </section>
        ) : (
          <div className="ok">{t('done_manual')}</div>
        )}

        {code && <p className="small">{t('done_keep')}</p>}
        {goal.payment?.hash && <p className="small" style={{ wordBreak: 'break-all' }}>Tx {goal.payment.hash.slice(0, 16)}… · swap {goal.payment.swapId}</p>}

        <div className="bottom">
          <button type="button" className="btn ink" onClick={() => reset('catalog')}>{t('done_new')}</button>
        </div>
      </main>
    </>
  )
}
