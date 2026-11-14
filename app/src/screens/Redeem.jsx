import { useEffect, useState } from 'react'
import { useApp, useBlockBack } from '../App.jsx'
import { detailText, itemLabel, itemName } from '../lib/itemName.js'
import { BrandLogo, ErrorBox, FieldError, Header, Icon, Notice } from '../components/ui.jsx'
import { classify, lastLogText } from '../lib/errors.js'
import { getGoal, savedNim, updateGoal } from '../lib/goals.js'
import { goalVersion } from '../lib/version.js'
import { worksLine } from '../lib/brands.js'
import { findItem, refreshCatalog } from '../lib/catalog.js'
import { goalCardIssue } from '../lib/availability.js'
import { CardIssue } from '../components/CardIssue.jsx'
import { host, isDemo, payInvoice } from '../lib/nimiq.js'
import { getUnlockState, settleGoal } from '../lib/unlockFlow.js'
import { invoiceMatchesPrice, parseInvoice } from '../lib/invoice.js'
import { usdToNim } from '../lib/price.js'
import { config } from '../lib/config.js'
import { api } from '../lib/api.js'
import { fmtInt, fmtNim, fmtUsd } from '../lib/format.js'
import { fmtFiatValue, pickFiat } from '../lib/fiatValue.js'
import { effectiveCurrency } from '../lib/currency.js'
import { goalBrand } from './Home.jsx'

const EMAIL_KEY = 'dibs.email'

// BUG-03: a payment whose outcome is unknown stays locked across reloads until the shop confirms it.
const PENDING_KEY = 'dibs.pending'
const POLL_MS = 10_000
const readPayLock = (goalId) => {
  try { const p = JSON.parse(localStorage.getItem(PENDING_KEY)); return p?.kind === 'pay' && p.goalId === goalId ? p : null } catch { return null }
}
const clearPayLock = (goalId) => { try { if (readPayLock(goalId)) localStorage.removeItem(PENDING_KEY) } catch { /* ignore */ } }
// Same rule as the server (server/src/index.js, POST /api/redeem).
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''))

export default function Redeem({ goalId }) {
  const { t, lang, address, prices, refreshBalance, back, go, reset, toast } = useApp()
  const goal = getGoal(address, goalId)
  const item = goal && findItem(goal.itemId)
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(EMAIL_KEY) || '' } catch { return '' } })
  const [emailTouched, setEmailTouched] = useState(false) // the field error waits for the first blur
  // A pay lock left by an earlier session restores the locked state: order = { orderId } only, no invoice to pay.
  const [order, setOrder] = useState(() => { const l = readPayLock(goalId); return l?.orderId ? { orderId: l.orderId, orderToken: l.orderToken || null } : null }) // { orderId, orderToken, invoice, sats, usd, expiresAt }
  const [invoice, setInvoice] = useState('')
  const [left, setLeft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [unknown, setUnknown] = useState(() => !!readPayLock(goalId))
  const [problem, setProblem] = useState(null) // ErrorKey
  const [refused, setRefused] = useState(false) // the shop refused the card at checkout (gone or sold out)

  // Countdown to the invoice expiry (Bitrefill locks the price for 30 minutes).
  useEffect(() => {
    if (!order?.expiresAt) return
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(order.expiresAt) - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [order])

  // The lock goes away once the goal is redeemed (only on a confirmed outcome or a redeemed goal).
  useEffect(() => { if (goal?.status === 'redeemed') clearPayLock(goalId) }, [goal?.status, goalId])

  // Get my card resumes from the chain: if NIM is still inactive or retired, the goal goes back to its unlock step.
  // Never while a payment is locked or an invoice is open (the payment may already have spent the NIM).
  useEffect(() => {
    if (goal?.status !== 'ready' || readPayLock(goalId) || order) return undefined
    let live = true
    getUnlockState(goal, address).then((us) => {
      if (!live) return
      const { goal: g } = settleGoal(address, getGoal(address, goalId), us)
      if (g && g.status !== 'ready') reset('goal', { goalId })
    }).catch(() => { /* chain unreadable: the payment flow stays as it is */ })
    return () => { live = false }
  }, [goalId]) // eslint-disable-line react-hooks/exhaustive-deps

  // The shop is the truth: confirmed paid = goal redeemed, lock removed, go to Done.
  const lockedOrderId = unknown ? (readPayLock(goalId)?.orderId || order?.orderId || null) : null // the order paid with an unknown outcome
  const lockedToken = unknown ? (readPayLock(goalId)?.orderToken || order?.orderToken || null) : null
  const confirmed = (orderId, orderToken) => {
    updateGoal(address, goalId, { status: 'redeemed', payment: { orderId, orderToken: orderToken || null, at: new Date().toISOString(), outcome: 'confirmed' } })
    clearPayLock(goalId)
    refreshBalance()
    reset('done', { goalId })
  }
  const checkOrder = async (orderId, orderToken, alive = () => true) => {
    try {
      const o = await api.order(orderId, orderToken)
      if (alive() && (o?.status === 'complete' || o?.code)) { confirmed(orderId, orderToken); return true }
    } catch { /* not readable yet: keep the lock, try again */ }
    return false
  }
  useEffect(() => {
    if (!lockedOrderId) return
    let stop = false
    const alive = () => !stop
    checkOrder(lockedOrderId, lockedToken, alive)
    const id = setInterval(() => checkOrder(lockedOrderId, lockedToken, alive), POLL_MS)
    return () => { stop = true; clearInterval(id) }
  }, [lockedOrderId]) // eslint-disable-line react-hooks/exhaustive-deps

  useBlockBack(busy) // Android back waits while Nimiq Pay has the payment open

  if (!goal) return null // a card gone from the catalogue still renders: it shows the "not available" choices
  const apiMode = config.redeemMode === 'api'
  const current = apiMode ? order?.invoice || '' : invoice
  const parsed = parseInvoice(current)
  const expired = apiMode && left === 0 && !unknown // while locked, a new price must not drop the order being checked
  const locked = unknown || !!readPayLock(goal.id)
  // The order's USD: the shop's price asked again at checkout, or (shop not read) the invoice's sats at the BTC price.
  // Never the catalogue's price: what is paid is the invoice, and the USD shown must match it.
  const orderUsd = order?.usd ?? (order?.sats && prices?.btcUsd ? (order.sats / 1e8) * prices.btcUsd : null)
  // In API mode the server tells us the exact sats; in manual mode we compare with the BTC price.
  const check = parsed
    ? apiMode && order?.sats
      ? { ok: Math.abs(parsed.sats - order.sats) <= 1, invoiceUsd: orderUsd }
      : prices?.btcUsd ? invoiceMatchesPrice({ sats: parsed.sats, btcUsd: prices.btcUsd, expectedUsd: goal.usd }) : null
    : null
  // BUG-08a, display only: the invoice's own USD (the server's quote for this invoice, or its sats at the BTC price
  // in manual mode), in NIM at today's rate. Nimiq Pay does the real conversion, so it reads "about".
  const invoiceUsd = apiMode ? orderUsd : check?.invoiceUsd ?? null
  const payNim = parsed && invoiceUsd != null && prices?.nimUsd ? usdToNim(invoiceUsd, prices.nimUsd) : null
  const emailBad = !emailOk(email)
  // Display only. The invoice asks more NIM than the goal saved: say so before Nimiq Pay opens (the extra comes from
  // the wallet; Nimiq Pay still confirms the real amount). And which accounts the card works with, with Change card.
  const saved = savedNim(goal)
  const priceUp = payNim != null && !expired && !locked && (!check || check.ok) && payNim > saved
  const works = goalVersion(goal).worksWith

  // Card no longer available (catalogue check at launch, or the shop's answer at checkout): the same message and
  // choices as on the goal, instead of a generic error. Never while a payment outcome is unknown or an invoice exists.
  const unavailable = !unknown && !order && (refused || !item || Boolean(goalCardIssue(goal)))

  const getInvoice = async () => {
    setError(null)
    if (unavailable) return
    if (emailBad) { setEmailTouched(true); return }
    try { localStorage.setItem(EMAIL_KEY, email) } catch { /* ignore */ }
    setBusy(true)
    try {
      setOrder(await api.createOrder(item.id, email))
    } catch (e) {
      const key = classify(e, 'invoice')
      // Was the card withdrawn or sold out since launch? The shop says so (409 out of stock, 400 unknown item),
      // or a fresh read of the catalogue does.
      const shopRefused = e.apiError === 'SHOP_OUT_OF_STOCK' || /unknown item/i.test(e.message || '')
      if (key !== 'SRV_DOWN') await refreshCatalog()
      if (shopRefused || goalCardIssue(getGoal(address, goalId))) { setRefused(true); return }
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
    // Never pay while an earlier payment for this goal may have gone through, even with a new invoice.
    if (readPayLock(goal.id)) { setUnknown(true); return }
    setError(null)
    setBusy(true)
    try {
      // Demo wallet only: tells the fake wallet how much NIM to deduct.
      const toPay = isDemo() ? `${current}#nim=${usdToNim(goal.usd, prices?.nimUsd || config.fallbackNimUsd)}` : current
      const res = await payInvoice(toPay)
      updateGoal(address, goal.id, { status: 'redeemed', payment: { ...res, orderId: order?.orderId || null, orderToken: order?.orderToken || null, at: new Date().toISOString() } })
      refreshBalance()
      reset('done', { goalId: goal.id })
    } catch (e) {
      const key = classify(e, 'pay')
      if (key === 'PAY_CANCELLED') toast(t('err_PAY_CANCELLED_toast'))
      else if (key === 'PAY_DUPLICATE') {
        // Already paid: never pay again, go and wait for the code.
        toast(t('err_PAY_DUPLICATE_toast'))
        updateGoal(address, goal.id, { status: 'redeemed', payment: { orderId: order?.orderId || null, orderToken: order?.orderToken || null, at: new Date().toISOString() } })
        clearPayLock(goal.id)
        reset('done', { goalId: goal.id })
      } else if (key === 'PAY_UNKNOWN') {
        // Never call pay again for this invoice. Remember it so a reload keeps the lock.
        setUnknown(true)
        try { localStorage.setItem('dibs.pending', JSON.stringify({ kind: 'pay', goalId: goal.id, orderId: order?.orderId || null, orderToken: order?.orderToken || null, outcome: 'unknown', at: new Date().toISOString() })) } catch { /* ignore */ }
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
        {apiMode && !unavailable ? (
          <h2 className="title pay-title"><span className="pay-title-1">{t('redeem_title1')}</span><span className="pay-title-2">{itemName(t, goal)}</span></h2>
        ) : (
          <h2 className="title">{t('redeem_title', { name: itemName(t, goal) })}</h2>
        )}

        {unavailable ? (
          <CardIssue goal={goal} force />
        ) : apiMode ? (
          <>
            {/* Steps: 1 Receipt until an order exists, 2 Pay once it does (and while locked or expired). */}
            <ol className="pay-steps" aria-hidden="true">
              {[t('redeem_step_receipt'), t('redeem_step_pay'), t('redeem_step_code')].map((label, i) => {
                const n = i + 1
                const current = order ? 2 : 1
                const state = n < current ? 'done' : n === current ? 'now' : 'next'
                return (
                  <li key={n} className={`pay-step ${state}`}>
                    <span className="pay-step-n">{state === 'done' ? <Icon name="check" size={14} /> : n}</span>
                    <span className="pay-step-l">{label}</span>
                  </li>
                )
              })}
            </ol>

            {/* The card, its price, and Change card (hidden while a payment is locked). */}
            <section className="card pay-card">
              <div className="pay-card-row">
                {(() => {
                  const brand = goalBrand(goal)
                  const name = (goal.brandName || brand.name || '').replace(/ gift card$/i, '')
                  return (
                    <div className="pay-brand">
                      <BrandLogo brand={brand} className="pay-logo" />
                      <div className="pay-brand-txt">
                        <b className="pay-brand-name">{name}</b>
                        <span className="pay-brand-sub">{detailText(t, goal)} · {t(`region_${goalVersion(goal).region}`)}</span>
                      </div>
                    </div>
                  )
                })()}
                <div className="pay-card-right">
                  <b className="pay-price">{fmtUsd(orderUsd ?? goal.usd, lang)} USD</b>
                  {!locked && <button type="button" className="pay-change" onClick={() => go('catalog', { changeFor: goal.id })}>{t('avail_change')}</button>}
                </div>
              </div>
            </section>

            {/* Step 1: the email for the receipt. */}
            {!order && (
              <section className="card pay-email-card">
                <label htmlFor="email" className="pay-field-label">{t('redeem_email')}</label>
                <div className="pay-email">
                  <svg className="pay-email-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>
                  <input id="email" className={`email${emailTouched && emailBad ? ' bad' : ''}`} type="email" inputMode="email" autoComplete="email" value={email}
                    aria-invalid={emailTouched && emailBad} aria-describedby={emailTouched && emailBad ? 'email-err' : undefined}
                    onChange={(e) => setEmail(e.target.value)} onBlur={() => setEmailTouched(true)} placeholder="you@example.com" />
                </div>
                {emailTouched && emailBad && <div id="email-err"><FieldError>{t('redeem_email_bad')}</FieldError></div>}
                <p className="small pay-email-why">{t('redeem_email_why')}</p>
              </section>
            )}

            {/* Step 2: You pay. One total, where it comes from, and the price lock. */}
            {order?.invoice && !expired && (
              <section className="card pay-you">
                <div className="pay-total">
                  <span className="pay-total-main"><b>{payNim != null ? fmtNim(payNim, lang) : '—'}</b><span className="pay-total-unit">NIM</span></span>
                  {payNim != null && (() => {
                    const fiat = prices?.live ? pickFiat(prices.rates, effectiveCurrency(host.fiat())) : null
                    const approx = fmtFiatValue(payNim, fiat, lang)
                    return approx ? <span className="pay-approx">≈ {approx}</span> : null
                  })()}
                </div>
                <div className="pay-rows">
                  <div className="pay-row"><span>{t('redeem_row_price')}</span><b>{fmtUsd(invoiceUsd ?? orderUsd ?? goal.usd, lang)} USD</b></div>
                  {payNim != null && <div className="pay-row"><span>{t('redeem_row_saved')}</span><b>{fmtNim(Math.min(saved, payNim), lang)} NIM</b></div>}
                  {priceUp && <div className="pay-row extra"><span>{t('redeem_row_wallet')}</span><b>+{fmtNim(payNim - saved, lang)} NIM</b></div>}
                  <div className="pay-row receipt"><span>{t('redeem_row_receipt')}</span><b>{email}</b></div>
                </div>
                {priceUp && <p className="pay-moved">{t('redeem_price_moved')}</p>}
                {left != null && (
                  <p className="pay-lock">
                    <svg className="pay-lock-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>
                    <span className="countdown">{t('redeem_expires', { time: mmss(left) })}</span>
                  </p>
                )}
              </section>
            )}
            {expired && <Notice tone="info" title={t('err_PAY_EXPIRED_title')} sub={t('err_PAY_EXPIRED_sub')} safe={t('safe_nothingCharged')} />}
          </>
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
            safe={lockedOrderId ? t('err_PAY_UNKNOWN_safe', { order: lockedOrderId.slice(0, 8), seconds: POLL_MS / 1000 }) : null} safeTone="r"
            actions={[
              // Check now asks the shop. Without an order id (manual mode) there is nothing to poll: keep the old hand-off to Done.
              { label: t('err_PAY_UNKNOWN_action'), onClick: () => {
                if (lockedOrderId) { checkOrder(lockedOrderId); return }
                updateGoal(address, goal.id, { status: 'redeemed', payment: { orderId: null, at: new Date().toISOString(), outcome: 'unknown' } }); clearPayLock(goal.id); reset('done', { goalId: goal.id })
              } },
              ...(lockedOrderId ? [{ label: t('err_PAY_UNKNOWN_action2'), onClick: () => { navigator.clipboard?.writeText(lockedOrderId); toast(t('err_copied')) } }] : []),
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

        {/* API: the two trust notes, above the button. Manual mode keeps its own refund line and summary. */}
        {apiMode && !unavailable ? (
          <>
            {order?.invoice && !expired && <p className="pay-note"><Icon name="info" size={18} /><span>{t('redeem_pay_nim')}</span></p>}
            <p className="pay-note"><Icon name="shield" size={18} /><span>{t('redeem_source')}</span></p>
          </>
        ) : !unavailable ? (
          <>
            <p className="small">{t('redeem_refund')}</p>
            {priceUp && (
              <Notice tone="info" title={t('err_PAY_PRICE_CHANGED_title')}
                sub={t('err_PAY_PRICE_CHANGED_sub', { usd: fmtUsd(invoiceUsd, lang), nim: fmtNim(payNim, lang), saved: fmtNim(saved, lang), extra: fmtNim(payNim - saved, lang) })}>
                <div className="pc-rows">
                  <div><span>{t('err_PAY_PRICE_CHANGED_rowSaved')}</span><b>{fmtNim(saved, lang)} NIM</b></div>
                  <div><span>{t('err_PAY_PRICE_CHANGED_rowWallet')}</span><b>{fmtNim(payNim - saved, lang)} NIM</b></div>
                  <div><span>{t('err_PAY_PRICE_CHANGED_rowPay')}</span><b>{fmtNim(payNim, lang)} NIM</b></div>
                </div>
              </Notice>
            )}
            {payNim != null && !expired && !locked && (!check || check.ok) && (
              <div className="pay-sum" role="status">
                <b>{t('redeem_pay_about', { nim: fmtNim(payNim, lang), usd: fmtUsd(invoiceUsd, lang) })}</b>
                <span className="small pay-nim">{t('redeem_pay_nim')}</span>{/* Nimiq Pay may ask NIM or USDT: Dibs cannot preselect NIM */}
              </div>
            )}
          </>
        ) : null}

        {!unavailable && <div className="bottom">
          {expired ? (
            <button type="button" className="btn" disabled={busy} onClick={() => { setOrder(null); setLeft(null) }}>{t('err_PAY_EXPIRED_cta')}</button>
          ) : apiMode && !order ? (
            <button type="button" className="btn" disabled={busy || emailBad} onClick={getInvoice}>{busy ? t('loading_short') : t('redeem_continue')}</button>
          ) : (
            <button type="button" className="btn" disabled={busy || !parsed || locked || (check && !check.ok)} onClick={pay}>
              {busy ? t('redeem_paying') : locked ? t('err_PAY_UNKNOWN_cta') : apiMode ? t('redeem_pay_btn', { nim: fmtNim(payNim, lang) }) : t('redeem_pay')}
            </button>
          )}
        </div>}
      </main>
    </>
  )
}
