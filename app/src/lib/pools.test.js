// The checked pools (lib/pools.js): the fixed list, validation of the live list, fee and schedule formatting, and the
// stored choice / known pool. Pure functions, plus the small localStorage-backed helpers tested against a fake window.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHECKED, DEFAULT_POOL, sameAddress, isChecked, checkedPool, validAddress, validLogo, pickable, feeText,
  getChoice, setChoice, rememberPool, knownPool, currentPool,
} from './pools.js'

const GARUDA = 'NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7'
const SIAM = 'NQ38 VK34 DRBL S3CN M9KM 8UJN 9JY2 2KFN VQQH'
const RITVARS = 'NQ08 LMAK 00XK YYN9 CDXV ADVG CL0U HUBM J670'
const OUTSIDE = 'NQ77 ZZZZ YYYY XXXX WWWW VVVV UUUU TTTT SSSS'

// A fake localStorage on global.window, reset before each storage test.
function fakeWindow() {
  const m = new Map()
  global.window = { localStorage: {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  } }
  return m
}

// A valid entry from the service for a checked pool.
const entry = (address, over = {}) => ({
  address, name: checkedPool(address)?.name || 'Other', fee: 0.05, payoutType: 'restake', payoutSchedule: 'Every 12 hours',
  isListed: true, score: { dataStatus: 'current' }, logo: 'data:image/png;base64,AAAA', ...over,
})

test('the five checked pools are in the fixed order, Garuda first and the default', () => {
  assert.equal(CHECKED.length, 5)
  assert.deepEqual(CHECKED.map((p) => p.name), ['Garuda Pool', 'Mint Pool', 'Siam Pool', 'nim.re Staking Pool', 'Ritvars Staking'])
  assert.ok(sameAddress(DEFAULT_POOL, GARUDA))
})

test('sameAddress ignores spaces and case; empty never matches', () => {
  assert.ok(sameAddress(GARUDA, GARUDA.replace(/\s/g, '').toLowerCase()))
  assert.ok(!sameAddress('', ''))
  assert.ok(!sameAddress(GARUDA, SIAM))
})

test('isChecked and checkedPool recognise the five, reject anything else', () => {
  assert.ok(isChecked(SIAM))
  assert.ok(isChecked(GARUDA.replace(/\s/g, '')))
  assert.ok(!isChecked(OUTSIDE))
  assert.equal(checkedPool(SIAM).name, 'Siam Pool')
  assert.equal(checkedPool(OUTSIDE), null)
})

test('validAddress accepts a real Nimiq address, rejects the demo placeholder and junk', () => {
  assert.ok(validAddress(OUTSIDE))
  assert.ok(validAddress(GARUDA))
  assert.ok(!validAddress('NQ00 DEMO VALIDATOR'))
  assert.ok(!validAddress(''))
  assert.ok(!validAddress(null))
})

test('validLogo accepts the allowed base64 image data URLs under 60k, rejects the rest', () => {
  assert.ok(validLogo('data:image/webp;base64,AAAA'))
  assert.ok(validLogo('data:image/svg+xml;base64,AAAA'))
  assert.ok(validLogo('data:image/png;base64,AAAA'))
  assert.ok(validLogo('data:image/jpeg;base64,AAAA'))
  assert.ok(!validLogo('https://example.com/logo.png'))
  assert.ok(!validLogo('data:image/gif;base64,AAAA'))
  assert.ok(!validLogo('data:image/svg+xml,<svg>')) // not base64
  assert.ok(!validLogo('data:image/png;base64,' + 'A'.repeat(60000))) // too big
  assert.ok(!validLogo(null))
})

test('feeText formats per language; null gives nothing', () => {
  assert.equal(feeText(0.05, 'en'), '5%')
  assert.equal(feeText(0.0333, 'en'), '3.33%')
  assert.equal(feeText(0.0333, 'fr'), '3,33 %') // no-break space before the sign
  assert.equal(feeText(0.03, 'es'), '3%')
  assert.equal(feeText(null, 'en'), '')
  assert.equal(feeText(undefined, 'en'), '')
})

test('pickable keeps the checked, listed, restaking, current entries in the fixed order', () => {
  const list = [entry(SIAM, { payoutSchedule: 'Every 3 hours', fee: 0.03 }), entry(GARUDA), entry(RITVARS, { fee: 0.02 })]
  const got = pickable(list)
  assert.deepEqual(got.map((p) => p.name), ['Garuda Pool', 'Siam Pool', 'Ritvars Staking'])
  assert.equal(got[0].fee, 0.05)
  assert.equal(got[1].hours, 3)
})

test('pickable ignores an address outside the five', () => {
  const got = pickable([entry(GARUDA), entry(OUTSIDE)])
  assert.deepEqual(got.map((p) => p.address), [GARUDA])
})

test('pickable drops entries that are not listed, not restaking, with a bad fee, or stale', () => {
  assert.equal(pickable([entry(GARUDA), entry(SIAM, { isListed: false })]).length, 1)
  assert.equal(pickable([entry(GARUDA), entry(SIAM, { payoutType: 'direct' })]).length, 1)
  assert.equal(pickable([entry(GARUDA), entry(SIAM, { fee: 0.9 })]).length, 1)
  assert.equal(pickable([entry(GARUDA), entry(SIAM, { fee: '0.03' })]).length, 1) // fee must be a number
  assert.equal(pickable([entry(GARUDA), entry(SIAM, { score: { dataStatus: 'outdated' } })]).length, 1)
})

test('the default pool is always present, added from baked data with fee null when the service drops it', () => {
  const got = pickable([entry(SIAM, { payoutSchedule: 'Every 3 hours' })])
  const garuda = got.find((p) => sameAddress(p.address, GARUDA))
  assert.ok(garuda, 'Garuda is always offered')
  assert.equal(garuda.fee, null)
  assert.equal(garuda.hours, 12)
  assert.equal(garuda.logo, null)
  assert.equal(got[0].name, 'Garuda Pool') // still first
})

test('pickable parses hours, trims and caps the name, nulls a bad logo', () => {
  const got = pickable([entry(GARUDA, { name: '  ' + 'x'.repeat(60), payoutSchedule: 'weird', logo: 'nope' })])
  assert.equal(got[0].name.length, 40)
  assert.equal(got[0].hours, null)
  assert.equal(got[0].logo, null)
})

test('pickable falls back to the baked name when the service name is empty', () => {
  const got = pickable([entry(SIAM, { name: '   ' })])
  assert.equal(got.find((p) => sameAddress(p.address, SIAM)).name, 'Siam Pool')
})

test('pickable tolerates junk input', () => {
  assert.deepEqual(pickable(null).map((p) => p.name), ['Garuda Pool'])
  assert.deepEqual(pickable([null, 42, {}]).map((p) => p.name), ['Garuda Pool'])
})

test('getChoice returns the default when nothing is stored', () => {
  fakeWindow()
  assert.ok(sameAddress(getChoice(), DEFAULT_POOL))
})

test('setChoice stores only a checked address; getChoice re-validates untrusted storage', () => {
  const m = fakeWindow()
  assert.ok(setChoice(SIAM))
  assert.ok(sameAddress(getChoice(), SIAM))
  assert.ok(!setChoice(OUTSIDE)) // refused
  assert.ok(sameAddress(getChoice(), SIAM))
  m.set('dibs.poolChoice', OUTSIDE) // tampered storage
  assert.ok(sameAddress(getChoice(), DEFAULT_POOL)) // falls back to the default
})

test('rememberPool stores any valid address, refuses the demo placeholder; currentPool prefers it', () => {
  const m = fakeWindow()
  rememberPool('NQ00 DEMO VALIDATOR')
  assert.equal(knownPool(), null)
  rememberPool(OUTSIDE) // a user may stake elsewhere outside Dibs
  assert.equal(knownPool(), OUTSIDE)
  assert.ok(sameAddress(currentPool(), OUTSIDE)) // the known pool wins over the choice
  m.delete('dibs.pool')
  setChoice(SIAM)
  assert.ok(sameAddress(currentPool(), SIAM)) // then the choice, else the default
})
