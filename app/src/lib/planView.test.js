// Call dibs flow (v1.1.8, screens/planView.js): the NIM under a value on the brand sheet is the plan target, the plan
// timeline's dot count, the Your wallet percentage, the new strings.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtCompact, minsSince, pickPlanItem, planWeeks, timelineDots, valueNim, walletPct } from '../screens/planView.js'
import { usdToNim } from './price.js'
import { targetUsdOf } from './readyState.js'
import { makeT } from './i18n.js'

const live = { id: 'steam-eur-20', usd: 21.6, live: true }
const est = { id: 'airbnb-usa-100', usd: 100, live: false }

test('the NIM under a value is exactly usdToNim(targetUsdOf(item), nimUsd), live and estimated', () => {
  for (const nimUsd of [0.00123, 0.0021, 0.05]) {
    assert.equal(valueNim(live, nimUsd), usdToNim(targetUsdOf(live), nimUsd))
    assert.equal(valueNim(est, nimUsd), usdToNim(targetUsdOf(est), nimUsd))
  }
  // The estimated one carries the 10 % margin, like the plan target.
  assert.equal(valueNim(est, 0.002), Math.ceil(110.00000000000001 / 0.002))
  assert.ok(valueNim(est, 0.002) > usdToNim(est.usd, 0.002))
})

test('no price yet, or no usd: no NIM line', () => {
  assert.equal(valueNim(live, null), null)
  assert.equal(valueNim(live, 0), null)
  assert.equal(valueNim({ id: 'x' }, 0.002), null)
  assert.equal(valueNim(null, 0.002), null)
})

test('the plan uses the sheet value when it is in the version, else the first value', () => {
  const amounts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(pickPlanItem(amounts, 'b'), { item: amounts[1], found: true })
  assert.deepEqual(pickPlanItem(amounts, null), { item: amounts[0], found: true })
  assert.deepEqual(pickPlanItem(amounts, 'gone'), { item: amounts[0], found: false })
  assert.deepEqual(pickPlanItem([], 'b'), { item: null, found: false })
})

test('timeline dots: 2 weeks = 3, 2 months = 10, 6 months = 7', () => {
  assert.deepEqual(timelineDots(14), { unit: 'week', count: 3 })
  assert.deepEqual(timelineDots(61), { unit: 'week', count: 10 })
  assert.deepEqual(timelineDots(183), { unit: 'month', count: 7 })
  assert.equal(timelineDots(84).unit, 'week') // 12 weeks: still one dot per week
  assert.equal(timelineDots(85).unit, 'month')
  assert.equal(planWeeks(61), 9)
})

test('wallet percentage floors, caps at 100, and is hidden without a balance', () => {
  assert.equal(walletPct(999, 1000), 99)
  assert.equal(walletPct(1, 3), 33)
  assert.equal(walletPct(5000, 1000), 100)
  assert.equal(walletPct(0, 1000), 0)
  assert.equal(walletPct(null, 1000), null)
  assert.equal(walletPct(undefined, 1000), null)
  assert.equal(walletPct(500, 0), null)
})

test('compact weekly amounts and minutes since the price', () => {
  assert.equal(fmtCompact(114500, 'en'), '115K')
  assert.equal(fmtCompact(26000, 'en'), '26K')
  assert.equal(fmtCompact(8600, 'en'), '8.6K')
  assert.equal(minsSince(1000, 1000 + 59000), 0)
  assert.equal(minsSince(0, 5 * 60000), 5)
  assert.equal(minsSince(undefined, 1), null)
})

test('the new strings: fr and es keep a non-breaking space before %, the tip has a version without fiat', () => {
  const T = { en: makeT('en'), fr: makeT('fr'), es: makeT('es') }
  assert.ok(T.fr('plan_margin_chip').startsWith('+10 %'))
  assert.ok(T.es('plan_margin_chip').startsWith('+10 %'))
  for (const l of ['en', 'fr', 'es']) {
    const withFiat = T[l]('plan_tip', { amount: '8,600', fiat: '$12.00', date: 'Jan 13' })
    const without = T[l]('plan_tip_nofiat', { amount: '8,600', date: 'Jan 13' })
    assert.ok(withFiat.includes('(≈ $12.00)'), l)
    assert.equal(withFiat.replace(' (≈ $12.00)', ''), without, `${l}: same sentence without the fiat part`)
    for (const k of ['bs_values_title', 'bs_value_title', 'bs_cta_sub', 'bs_how_link2', 'plan_target3', 'plan_row_price', 'plan_row_rate', 'plan_row_wallet', 'plan_row_updated', 'plan_source', 'plan_opt_week']) {
      const s = T[l](k)
      assert.ok(s && s !== k, `${l} ${k}`)
      assert.ok(!s.includes('—'), `${l} ${k}: em dash`)
      assert.ok(!s.includes('!'), `${l} ${k}: exclamation mark`)
    }
  }
})
