import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header } from '../components/ui.jsx'
import { goalBrand } from './Home.jsx'
import { getGoal, updateGoal } from '../lib/goals.js'
import { api } from '../lib/api.js'
import { config } from '../lib/config.js'
import { isDemo } from '../lib/nimiq.js'

// Bitrefill invoice statuses, in order. Anything else shows as "waiting".
const STEPS = ['created', 'payment_detected', 'payment_confirmed', 'complete']

// Days from calling dibs to paying, at least 1.
const daysToYours = (goal) => Math.max(1, Math.ceil((Date.parse(goal.payment?.at || Date.now()) - Date.parse(goal.createdAt)) / 864e5))

// The shop's answer as kept on the goal. `code` from the server falls back to the PIN or the link
// (older contract), so drop it when it only repeats one of them.
function redemptionOf(o) {
  const link = o.link || null
  let pin = o.pin || null
  let code = o.code || null
  if (code && code === link) code = null
  if (code && code === pin) pin = null
  return code || pin || link ? { code, pin, link, at: new Date().toISOString() } : null
}

export default function Done({ goalId }) {
  const { t, lang, address, reset } = useApp()
  const goal = getGoal(address, goalId)
  const orderId = goal?.payment?.orderId
  // Kept on the goal once delivered, so Past dibs can reopen it. Never logged or sent anywhere.
  const [red, setRed] = useState(() => goal?.payment?.redemption || null)
  const [status, setStatus] = useState(null)
  const [show, setShow] = useState(false)

  // Polls our server until the shop delivers, then saves the redemption on the goal.
  useEffect(() => {
    if (config.redeemMode !== 'api' || !orderId || red) return
    const save = (r) => {
      const g = getGoal(address, goalId)
      if (g) updateGoal(address, goalId, { payment: { ...g.payment, redemption: r } })
      setRed(r)
    }
    if (isDemo()) { const id = setTimeout(() => { setStatus('complete'); save(redemptionOf({ code: 'DEMO-CODE-0000' })) }, 3000); return () => clearTimeout(id) }
    let stop = false
    const tick = async () => {
      try {
        const o = await api.order(orderId)
        if (stop) return
        setStatus(o.status)
        const r = redemptionOf(o)
        if (r) { save(r); return }
      } catch { /* retry */ }
      if (!stop) setTimeout(tick, 5000)
    }
    tick()
    return () => { stop = true }
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!goal) return null
  const stepIdx = Math.max(0, STEPS.indexOf(status))
  const code = red?.code || null
  const pin = red?.pin || null
  const link = red?.link || null
  const pinLabel = t('done_pin')
  const copyText = code ? (pin ? `${code} · ${pinLabel}${lang === 'fr' ? ' : ' : ': '}${pin}` : code) : pin || link
  const days = daysToYours(goal)
  return (
    <>
      <Header />
      <main className="screen">
        <div className="dibs-band">
          <b>Dibs!</b>
          <span>{red ? t('done_title') : t('done_paid')}</span>
          <span style={{ opacity: 0.9 }}>{goal.itemName} · {goal.itemDetail}</span>
        </div>

        {config.redeemMode === 'api' && orderId ? (
          // M5: brand card flips once on mount (CSS only) to the code card. Reading, polling and buttons unchanged.
          <section className="codecard">
            <div className="faces">
              <div className="face f" aria-hidden="true">
                <BrandLogo brand={goalBrand(goal)} />
                <div>
                  <div className="cc-name">{goal.itemName}</div>
                  <div className="cc-value">{goal.itemDetail}</div>
                </div>
              </div>
              <div className="face b">
                <div className="cc-label">{t('done_code')}</div>
                {!red && <div className="code-box">{t('done_waiting')}</div>}
                {!red && <p className="small">{t(`done_s${stepIdx}`)}</p>}
                {code && <div className="code-box">{show ? code : '•••• •••• ••••'}</div>}
                {pin && (
                  <>
                    <div className="cc-sub">{pinLabel}</div>
                    <div className="code-box">{show ? pin : '••••'}</div>
                  </>
                )}
                {red && (
                  <div className="pills">
                    {(code || pin) && <button type="button" className="btn ghost small" style={{ flex: 1 }} onClick={() => setShow(!show)}>{show ? t('done_hide') : t('done_show')}</button>}
                    {link && <a className="btn ghost small" style={{ flex: 1 }} href={link} target="_blank" rel="noopener noreferrer">{t('done_open_link')}</a>}
                    <button type="button" className="btn ghost small" style={{ flex: 1 }} onClick={() => navigator.clipboard?.writeText(copyText)}>{t('done_copy')}</button>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <div className="ok">{t('done_manual')}</div>
        )}

        {red && (
          <div className="facts">
            <div className="fact"><b>{t(days === 1 ? 'done_stat_days_one' : 'done_stat_days_other', { count: days })}</b>{t('done_stat_days_sub')}</div>
            <div className="fact"><b>{goal.deposits.length}</b>{t('done_stat_deposits')}</div>
          </div>
        )}
        {red && <p className="small">{t('done_kept')}</p>}
        {goal.payment?.hash && <p className="small" style={{ wordBreak: 'break-all' }}>Tx {goal.payment.hash.slice(0, 16)}… · swap {goal.payment.swapId}</p>}

        <div className="bottom">
          <button type="button" className="btn ink" onClick={() => reset('catalog')}>{t('done_new')}</button>
        </div>
      </main>
    </>
  )
}
