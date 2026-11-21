// The Add NIM field message choice (lib/depositField.js). Focus of v1.6.3: a staker open but an empty wallet says so
// plainly instead of "Your wallet has 0 NIM. Add it now..." (which makes no sense at 0).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { depositFieldFlags } from './depositField.js'

const MIN = 100
const flags = (o) => depositFieldFlags({ min: MIN, ...o })

test('staker open, wallet under 1 NIM: the empty-wallet message, not over-balance', () => {
  const f = flags({ hasStaker: true, balance: 0, amountNim: 50 })
  assert.deepEqual(f, { cantOpen: false, underMin: false, emptyWallet: true, overBalance: false })
})

test('empty wallet shows even before an amount is typed (amount 0)', () => {
  assert.equal(flags({ hasStaker: true, balance: 0, amountNim: 0 }).emptyWallet, true)
  // 0.4 NIM floors to 0: still empty.
  assert.equal(flags({ hasStaker: true, balance: 0.4, amountNim: 20 }).emptyWallet, true)
})

test('staker open with 1 NIM or more and an amount over balance: over-balance, not empty', () => {
  const f = flags({ hasStaker: true, balance: 5, amountNim: 20 })
  assert.deepEqual(f, { cantOpen: false, underMin: false, emptyWallet: false, overBalance: true })
})

test('staker open, amount within balance: no message', () => {
  const f = flags({ hasStaker: true, balance: 500, amountNim: 100 })
  assert.deepEqual(f, { cantOpen: false, underMin: false, emptyWallet: false, overBalance: false })
})

test('first deposit (no staker) under 100 with an empty wallet stays cantOpen, never emptyWallet', () => {
  const f = flags({ hasStaker: false, balance: 0, amountNim: 50 })
  assert.equal(f.cantOpen, true)
  assert.equal(f.emptyWallet, false) // the first-deposit message (needs 100 NIM) is unchanged
})

test('first deposit (no staker), wallet covers 100 but the amount is under the minimum: underMin', () => {
  const f = flags({ hasStaker: false, balance: 200, amountNim: 50 })
  assert.deepEqual(f, { cantOpen: false, underMin: true, emptyWallet: false, overBalance: false })
})

test('balance still reading (null): no message yet', () => {
  assert.deepEqual(flags({ hasStaker: true, balance: null, amountNim: 20 }),
    { cantOpen: false, underMin: false, emptyWallet: false, overBalance: false })
})
