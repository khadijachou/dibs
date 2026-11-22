import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { fmtAmount, fmtSigned1 } from '../lib/format.js'
import { getConv7d, pct7d, sparkPoints } from '../lib/conv7d.js'
import { getLastRates } from '../lib/price.js'
import { effectiveCurrency } from '../lib/currency.js'
import { host } from '../lib/nimiq.js'
import { caretAfterDigits, cleanDigits, digitsBefore, formatAmount } from '../lib/addPreview.js'
import { timeText } from './ReleaseClock.jsx'

// The Savings NIM converter (v1.6.2, display only): an editable NIM amount and its value at the live rate, with a 7-day
// sparkline. No money moves here: it reads the live price and the last price kept on the phone. No buy or sell wording.

const CONV_CUR_KEY = 'dibs.convCur'
const CONV_OPTS = ['auto', 'USD', 'EUR', 'GBP', 'NGN']
const readConvCur = () => { try { const v = localStorage.getItem(CONV_CUR_KEY); return CONV_OPTS.includes(v) ? v : 'auto' } catch { return 'auto' } }
const writeConvCur = (v) => { try { localStorage.setItem(CONV_CUR_KEY, v) } catch { /* storage blocked: this session only */ } }

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
// A typed money value -> a number: drop everything but digits and a decimal point (comma read as a point for fr and es).
const parseMoney = (s) => {
  const cleaned = String(s ?? '').replace(/[^\d.,]/g, '').replace(/,/g, '.')
  const [whole, ...rest] = cleaned.split('.')
  return Number(rest.length ? `${whole}.${rest.join('')}` : whole) || 0
}
// The rate for a currency from a "nimiq-2" rates object, falling back to USD like the header (lib/fiatValue.js pickFiat).
const pickRate = (rates, code) => {
  if (!rates) return null
  const own = Number(rates[String(code).toLowerCase()])
  if (own > 0) return { code, rate: own }
  const usd = Number(rates.usd)
  return usd > 0 ? { code: 'USD', rate: usd } : null
}

// "NIM converter · live rate": an editable NIM amount and its value in the chosen currency, each updating the other, with
// a 7-day sparkline. Live rate when there is one, else the last rate kept on the phone with "as of {time}". Hidden when
// no rate has ever been read.
export function ConverterCard() {
  const { t, lang, prices } = useApp()
  const [choice, setChoice] = useState(readConvCur)
  const [nim, setNim] = useState('10000') // digit string, like Add NIM
  const [curText, setCurText] = useState('')
  const [series, setSeries] = useState(null)
  const editingCur = useRef(false)

  const auto = choice === 'auto'
  const effCur = auto ? effectiveCurrency(host.fiat()) : choice
  const live = prices?.live ? prices.rates : null
  const last = live ? null : getLastRates()
  const picked = pickRate(live || last?.rates || null, effCur)
  const rate = picked?.rate ?? null
  const shownCur = picked?.code || effCur
  const usingLast = !live && !!last && rate != null

  // Keep the currency field in step with the NIM amount whenever the rate or amount changes, unless the user is typing
  // in the currency field (then the NIM field follows instead).
  useEffect(() => {
    if (editingCur.current || rate == null) return
    setCurText(fmtAmount(round2((Number(cleanDigits(nim)) || 0) * rate), lang))
  }, [rate, lang, nim])

  // The 7-day series for the shown currency (lib/conv7d.js), once per currency per day. A failure leaves it null: the
  // sparkline and the percent are simply not shown.
  useEffect(() => {
    if (rate == null) return undefined
    let alive = true
    getConv7d(shownCur).then((s) => { if (alive) setSeries(s) }).catch(() => { if (alive) setSeries(null) })
    return () => { alive = false }
  }, [shownCur, rate])

  if (rate == null) return null // no live rate and nothing kept on the phone: the card is hidden

  const onNimInput = (e) => {
    editingCur.current = false
    const el = e.target
    const left = digitsBefore(el.value, el.selectionStart)
    const next = cleanDigits(el.value)
    const shown = formatAmount(next, lang)
    el.value = shown
    const c = caretAfterDigits(shown, left)
    try { el.setSelectionRange(c, c) } catch { /* selection not settable here */ }
    setNim(next)
  }
  const onCurInput = (e) => {
    editingCur.current = true
    const raw = e.target.value
    setCurText(raw)
    setNim(String(Math.round(parseMoney(raw) / rate)))
  }
  const pickCur = (v) => { editingCur.current = false; setChoice(v); writeConvCur(v) }

  const pct = pct7d(series)
  const showSpark = Array.isArray(series) && series.length >= 2 && pct != null
  const curLabel = auto ? t('conv_auto_label', { cur: shownCur }) : shownCur

  return (
    <section className="card conv-card">
      <span className="stake-label">{t('conv_title')}</span>
      <div className="conv-fields">
        <label className="conv-field">
          <input type="text" inputMode="numeric" className="conv-in" value={formatAmount(nim, lang)}
            onFocus={() => { editingCur.current = false }} onInput={onNimInput} aria-label="NIM" />
          <span className="conv-unit">NIM</span>
        </label>
        <span className="conv-eq" aria-hidden="true">=</span>
        <label className="conv-field">
          <input type="text" inputMode="decimal" className="conv-in" value={curText}
            onFocus={() => { editingCur.current = true }} onInput={onCurInput} aria-label={curLabel} />
          <span className="conv-unit">{curLabel}</span>
        </label>
      </div>
      <div className="conv-segs" role="group">
        {CONV_OPTS.map((o) => (
          <button type="button" key={o} className={`conv-seg${choice === o ? ' on' : ''}`} onClick={() => pickCur(o)}>
            {o === 'auto' ? t('conv_auto') : o}
          </button>
        ))}
      </div>
      {showSpark && (
        <div className="conv-trend">
          <svg className="conv-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={sparkPoints(series)} fill="none" />
          </svg>
          <span className="conv-pct">{t('conv_7d', { x: fmtSigned1(pct, lang) })}</span>
        </div>
      )}
      {usingLast && <p className="conv-asof">{t('conv_asof', { time: timeText(last.at, lang) })}</p>}
    </section>
  )
}
