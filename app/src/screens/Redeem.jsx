import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { ErrorBox, Header, Notice } from '../components/ui.jsx'
import { classify, lastLogText } from '../lib/errors.js'
import { getGoal, updateGoal } from '../lib/goals.js'
import { findItem } from '../lib/catalog.js'
import { isDemo, payInvoice } from '../lib/nimiq.js'
import { invoiceMatchesPrice, parseInvoice } from '../lib/invoice.js'
import { usdToNim } from '../lib/price.js'
import { config } from '../lib/config.js'
import { api } from '../lib/api.js'
import { fmtUsd } from '../lib/format.js'

const EMAIL_KEY = 'dibs.email'
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export default function Redeem({ goalId }) {
  const { t, lang, address, prices, refreshBalance, back, reset, toast } = useApp()
  const goal = getGoal(address, goalId)
  const item = goal && findItem(goal.itemId)
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(EMAIL_KEY) || '' } catch { return '' } })
  const [order, setOrder] = useState(null) // { orderId, invoice, sats, usd, expiresAt }
  const [invoice, setInvoice] = useState('')
  const [left, setLeft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [unknown, setUnknown] = useState(false)
  const [problem, setProblem] = useState(null) // ErrorKey

  // Countdown to the invoice expiry (Bitrefill locks the price for 30 minutes).
  useEffect(() => {
    if (!order?.expiresAt) return
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(order.expiresAt) - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [order])

  if (!goal || !item) return null
  const apiMode = config.redeemMode === 'api'
  const current = apiMode ? order?.invoice || '' : invoice
  const parsed = parseInvoice(current)
  const expired = apiMode && left === 0
  // In API mode the server tells us the exact sats; in manual mode we compare with the BTC price.
  const check = parsed
    ? apiMode && order?.sats
      ? { ok: Math.abs(parsed.sats - order.sats) <= 1, invoiceUsd: order.usd }
      : prices?.btcUsd ? invoiceMatchesPrice({ sats: parsed.sats, btcUsd: prices.btcUsd, expectedUsd: goal.usd }) : null
    : null

  const getInvoice = async () => {
    setError(null)
    if (!emailOk(email)) { setError(new Error(t('redeem_email_bad'))); return }
    try { localStorage.setItem(EMAIL_KEY, email) } catch { /* ignore */ }
    setBusy(true)
    try {
      setOrder(await api.createOrder(item.id, email))
    } catch (e) {
      const key = classify(e, 'invoice')
      if (isDemo() && !e.apiError?.match(/^(SHOP_LIMIT|SRV_DOWN)$/)) {
        // Demo wallet with no Bitrefill credentials: fake a 30-minute invoice so the flow can be walked.
        const sats = Math.round((goal.usd / (prices?.btcUsd || 80000)) * 1e8)
        setOrder({ orderId: 'demo-' + Date.now(), invoice: 'lnbc' + sats * 10 + 'n1' + 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'.repeat(3), sats, usd: goal.usd, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() })
      } else if (key === 'RATE_LIMIT') {
        toast(t('err_RATE_LIMIT_toast'))
      } else {
        setProblem(key)
      }
    } finally {
      setBusy(false)
    }
  }

  const pay = async () => {
    setError(null)
    setBusy(true)
    try {
      // Demo wallet only: tells the fake wallet how much NIM to deduct.
      const toPay = isDemo() ? `${current}#nim=${usdToNim(goal.usd, prices?.nimUsd || config.fallbackNimUsd)}` : current
      const res = await payInvoice(toPay)
      updateGoal(address, goal.id, { status: 'redeemed', payment: { ...res, orderId: order?.orderId || null, at: new Date().toISOString() } })
      refreshBalance()
      reset('done', { goalId: goal.id })
    } catch (e) {
      const key = classify(e, 'pay')
      if (key === 'PAY_CANCELLED') toast(t('err_PAY_CANCELLED_toast'))
      else if (key === 'PAY_DUPLICATE') {
        // Already paid: never pay again, go and wait for the code.
        toast(t('err_PAY_DUPLICATE_toast'))
        updateGoal(address, goal.id, { status: 'redeemed', payment: { orderId: order?.orderId || null, at: new Date().toISOString() } })
        reset('done', { goalId: goal.id })
      } else if (key === 'PAY_UNKNOWN') {
        // Never call pay again for this invoice. Remember it so a reload keeps the lock.
        setUnknown(true)
        try { localStorage.setItem('dibs.pending', JSON.stringify({ kind: 'pay', goalId: goal.id, orderId: order?.orderId || null, outcome: 'unknown', at: new Date().toISOString() })) } catch { /* ignore */ }
      } else setProblem(key)
    } finally {
      setBusy(false)
    }
  }

  const demoInvoice = () => setInvoice('lnbc' + Math.round((goal.usd / (prices?.btcUsd || 100000)) * 1e8 * 10) + 'n1' + 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'.repeat(3))
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <h2 className="title">{t('redeem_title', { name: goal.itemName })}</h2>

        {apiMode ? (
          <section className="card">
            <div className="row"><span className="sub">{goal.itemName} · {goal.itemDetail}</span><b>{fmtUsd(order?.usd ?? goal.usd, lang)} USD</b></div>
            {!order && (
              <>
                <label htmlFor="email" className="sub">{t('redeem_email')}</label>
                <input id="email" className="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                <p className="small">{t('redeem_email_why')}</p>
                <button type="button" className="btn ink small" disabled={busy} onClick={getInvoice}>{busy ? t('loading_short') : t('redeem_get_invoice')}</button>
              </>
            )}
            {order && (
              <>
                <div className="ok">{t('redeem_ready', { sats: order.sats?.toLocaleString(lang) ?? '?' })}</div>
                {left != null && !expired && <p className="small countdown">{t('redeem_expires', { time: mmss(left) })}</p>}
                {expired && <Notice tone="info" title={t('err_PAY_EXPIRED_title')} sub={t('err_PAY_EXPIRED_sub')} safe={t('safe_nothingCharged')} />}
              </>
            )}
          </section>
        ) : (
          <section className="card">
            <p className="sub">{t('redeem_manual')}</p>
            <a className="btn ghost small" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }} href={item.shopUrl} target="_blank" rel="noreferrer">{t('redeem_open')}</a>
            <label htmlFor="inv" className="sub">{t('redeem_paste')}</label>
            <textarea id="inv" className="invoice" value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="lnbc…" />
            {isDemo() && <button type="button" className="btn ghost small" onClick={demoInvoice}>Demo invoice</button>}
          </section>
        )}

        {current && !parsed && <div className="err">{t('redeem_bad')}</div>}
        {check && !apiMode && (
          <div className={check.ok ? 'ok' : 'err'}>
            {t('redeem_check', { usd: fmtUsd(check.invoiceUsd, lang), price: fmtUsd(goal.usd, lang) })}
            {!check.ok && <><br />{t('redeem_mismatch')}</>}
          </div>
        )}
        {check && apiMode && !check.ok && <div className="err">{t('redeem_mismatch')}</div>}
        {unknown && (
          <Notice tone="stop" title={t('err_PAY_UNKNOWN_title')} sub={t('err_PAY_UNKNOWN_sub')}
            safe={order?.orderId ? t('err_PAY_UNKNOWN_safe', { order: order.orderId.slice(0, 8), seconds: 10 }) : null} safeTone="r"
            actions={[
              { label: t('err_PAY_UNKNOWN_action'), onClick: () => { updateGoal(address, goal.id, { status: 'redeemed', payment: { orderId: order?.orderId || null, at: new Date().toISOString(), outcome: 'unknown' } }); reset('done', { goalId: goal.id }) } },
              ...(order?.orderId ? [{ label: t('err_PAY_UNKNOWN_action2'), onClick: () => { navigator.clipboard?.writeText(order.orderId); toast(t('err_copied')) } }] : []),
            ]} />
        )}
        {problem === 'SHOP_LIMIT' || problem === 'SHOP_OUT_OF_STOCK' ? (
          <Notice tone="info" title={t(`err_${problem}_title`)} sub={t(`err_${problem}_sub`)} safe={t('safe_nothingCharged')} />
        ) : problem === 'SRV_DOWN' || problem === 'NO_CREDENTIALS' ? (
          <Notice tone="info" title={t('err_NO_CREDENTIALS_title')} sub={t('err_NO_CREDENTIALS_sub')} safe={t('safe_nothingCharged')}
            actions={[{ label: t('err_GENERIC_action'), onClick: () => { setProblem(null); getInvoice() } }]} />
        ) : problem ? (
          <Notice tone="info" title={t('err_GENERIC_title')} sub={t('err_GENERIC_sub')} safe={t('safe_nothingSent')}
            actions={[{ label: t('err_GENERIC_action2'), onClick: () => { navigator.clipboard?.writeText(lastLogText()); toast(t('err_copied')) } }]} />
        ) : null}
        {!unknown && !problem && <ErrorBox error={error} />}
        <p className="small">{t('redeem_refund')}</p>

        <div className="bottom">
          {expired ? (
            <button type="button" className="btn" disabled={busy} onClick={() => { setOrder(null); setLeft(null) }}>{t('err_PAY_EXPIRED_cta')}</button>
          ) : (
            <button type="button" className="btn" disabled={busy || !parsed || unknown || (check && !check.ok)} onClick={pay}>
              {busy ? t('redeem_paying') : unknown ? t('err_PAY_UNKNOWN_cta') : t('redeem_pay')}
            </button>
          )}
        </div>
      </main>
    </>
  )
}
