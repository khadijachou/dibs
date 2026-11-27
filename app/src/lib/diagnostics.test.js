// Copy diagnostics (lib/diagnostics.js). buildDiagnostics is pure; gather reads only, through injected deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDiagnostics, gather } from './diagnostics.js'

const GARUDA = 'NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7'
const A1 = 'NQ11 AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH' // short: NQ11 … HHHH
const A2 = 'NQ22 JJJJ KKKK LLLL MMMM NNNN PPPP QQQQ RRRR' // short: NQ22 … RRRR

const at = (y, mo, d, h, mi) => Date.UTC(y, mo, d, h, mi)
const T_AIR = at(2026, 10, 14, 9, 5)
const T_VAL5 = at(2026, 10, 15, 8, 0)
const T_VAL250 = at(2026, 10, 13, 22, 15)

const airbnb = { id: 'aaaa1111-2222', brandName: 'Airbnb', faceValue: '50', currency: 'USD', status: 'saving', deposits: [{ nim: 2000 }, { nim: 1200 }], unlockSteps: [], updatedAt: new Date(T_AIR).toISOString() }
const valorant5 = { id: 'bbbb1111', brandName: 'Valorant', faceValue: '5', currency: 'EUR', status: 'saving', deposits: [{ nim: 19501 }], unlockSteps: [], updatedAt: new Date(T_VAL5).toISOString() }
const valorant250 = { id: 'cccc1111', brandName: 'Valorant', faceValue: '2.50', currency: 'EUR', status: 'ready', deposits: [{ nim: 19501 }], unlockSteps: [{}, {}, {}], updatedAt: new Date(T_VAL250).toISOString() }

const sample = {
  version: '1.2.8',
  now: at(2026, 10, 15, 14, 30),
  tzOffsetMin: 0,
  lang: 'en',
  demo: false,
  accounts: [{ address: A1, nim: 17445 }, { address: A2, nim: 0 }],
  usedAddress: A1,
  staker: { active: 13620, inactive: 0, retired: 0, delegation: GARUDA, stakers: [A1] },
  validatorAddress: GARUDA,
  goalsShown: [airbnb, valorant5],
  copies: [{ address: A1, goal: airbnb }, { address: A1, goal: valorant5 }, { address: A2, goal: valorant250 }],
  pendingPay: false,
  deletedCount: 0,
}

test('the brief sample renders exactly, line by line', () => {
  const expected = [
    'Dibs diagnostics · v1.2.8 · 15 Nov 2026 14:30 (UTC+0)',
    'Mode: Nimiq Pay · Language: en',
    '',
    'Wallet addresses (as Nimiq Pay lists them)',
    '  NQ11 … HHHH  17,445 NIM  (used by Dibs)',
    '  NQ22 … RRRR  0 NIM',
    '',
    'Staking (read from the chain)',
    '  NQ11 … HHHH  active 13,620 · inactive 0 · retired 0 · Garuda Pool',
    '  Total in goals that should be staked: 22,701',
    '  Difference: +9,081 NIM',
    '',
    'Goals Dibs shows',
    '  Airbnb 50 USD · aaaa · saving · 3,200 NIM · 2 deposits · no unlock steps · changed 14 Nov 09:05',
    '  Valorant 5 EUR · bbbb · saving · 19,501 NIM · 1 deposit · no unlock steps · changed 15 Nov 08:00',
    '',
    'Every saved copy (address · goal · card · status · NIM · steps · changed)',
    '  NQ11 … HHHH  Airbnb aaaa  50 USD  saving  3,200  0  14 Nov 09:05  <- shown',
    '  NQ11 … HHHH  Valorant bbbb  5 EUR  saving  19,501  0  15 Nov 08:00  <- shown',
    '  NQ22 … RRRR  Valorant cccc  2.50 EUR  ready  19,501  3  13 Nov 22:15',
    '',
    'Other',
    '  Payment being checked: no',
    '  Unlock in progress: no',
    '  Deleted goals on this phone: 0',
    '  NIM put back in staking: never',
    '  Friends: off',
    '  Leaderboards: joined no, 0 deposits waiting, last answer: none, 0 wallets linked',
  ].join('\n')
  assert.equal(buildDiagnostics(sample), expected)
})

test('Friends: on when the state says so', () => {
  assert.ok(buildDiagnostics({ ...sample, friendsOn: true }).includes('Friends: on'))
})

test('Leaderboards line: joined label, deposits waiting, last answer and wallets linked; never a hash', () => {
  const t = buildDiagnostics({ ...sample, boards: { friends: true, global: true }, depositsWaiting: 2, lastBoardReason: 'duplicate', walletsLinked: 2 })
  assert.ok(t.includes('Leaderboards: joined both, 2 deposits waiting, last answer: duplicate, 2 wallets linked'))
  const g = buildDiagnostics({ ...sample, boards: { friends: false, global: true }, depositsWaiting: 0, lastBoardReason: null, walletsLinked: 1 })
  assert.ok(g.includes('Leaderboards: joined global, 0 deposits waiting, last answer: none, 1 wallets linked'))
  // Unknown wallet count falls back to 1 when Friends is on, 0 when off.
  assert.ok(buildDiagnostics({ ...sample, friendsOn: true, walletsLinked: null }).includes('last answer: none, 1 wallets linked'))
  assert.ok(buildDiagnostics({ ...sample, boards: null }).includes('Leaderboards: joined no, 0 deposits waiting, last answer: none, 0 wallets linked'))
})

test('gather never copies the device secret key or the demo wallet key', async () => {
  const MARK = 'SECRETMARKER_DO_NOT_COPY'
  const { storage } = makeStorage({
    'dibs.friends': JSON.stringify({ on: true, id: 'u1', code: 'DIBS-ABCD' }),
    'dibs.friends.key': MARK,
    'dibs.friends.demoWallet': MARK,
    'dibs.goals': JSON.stringify([airbnb]),
  })
  const state = await gather({
    storage, now: sample.now, tzOffsetMin: 0, version: '1.4.0', lang: 'en', demo: true,
    usedAddress: A1, validatorAddress: GARUDA,
    listAccounts: async () => [{ address: A1, nim: 100 }], readStaker: async () => null,
  })
  const text = buildDiagnostics(state)
  assert.ok(!text.includes(MARK), 'the secret marker must never appear in the copied text')
  assert.equal(state.friendsOn, true)
  assert.ok(text.includes('Friends: on'))
})

test('<- shown marks only the copy in goalsShown read under the used address', () => {
  const lines = buildDiagnostics(sample).split('\n')
  const shown = lines.filter((l) => l.includes('<- shown'))
  assert.equal(shown.length, 2) // Airbnb and Valorant 5, both under the used address
  // the ready copy under the other address is never marked
  assert.ok(lines.some((l) => l.includes('Valorant cccc') && !l.includes('<- shown')))
})

test('demo mode names Demo mode', () => {
  const t = buildDiagnostics({ ...sample, demo: true })
  assert.ok(t.includes('Mode: Demo mode · Language: en'))
})

test('no staker: the block says no staker and the Difference still shows', () => {
  const t = buildDiagnostics({ ...sample, staker: null })
  assert.ok(t.includes('Staking (read from the chain)'))
  assert.ok(t.includes('  no staker'))
  // active + inactive = 0, so the Difference is the whole Total
  assert.ok(t.includes('  Total in goals that should be staked: 22,701'))
  assert.ok(t.includes('  Difference: +22,701 NIM'))
})

test("staker 'error': Staking: unavailable, and no Difference line", () => {
  const t = buildDiagnostics({ ...sample, staker: 'error' })
  assert.ok(t.includes('Staking: unavailable'))
  assert.ok(!t.includes('Staking (read from the chain)'))
  assert.ok(!t.includes('Difference:'))
})

test("accounts 'error': Wallet addresses: unavailable", () => {
  const t = buildDiagnostics({ ...sample, accounts: 'error' })
  assert.ok(t.includes('Wallet addresses: unavailable'))
  assert.ok(!t.includes('(as Nimiq Pay lists them)'))
})

test('a single address', () => {
  const t = buildDiagnostics({ ...sample, accounts: [{ address: A1, nim: 100 }], usedAddress: A1 })
  const lines = t.split('\n')
  const i = lines.indexOf('Wallet addresses (as Nimiq Pay lists them)')
  assert.equal(lines[i + 1], '  NQ11 … HHHH  100 NIM  (used by Dibs)')
  assert.equal(lines[i + 2], '') // only one address, then the blank line
})

test('a goal with no updatedAt uses createdAt for changed', () => {
  const g = { id: 'dddd1111', brandName: 'Steam', faceValue: '20', currency: 'USD', status: 'saving', deposits: [{ nim: 500 }], unlockSteps: [], createdAt: new Date(T_VAL250).toISOString() }
  const t = buildDiagnostics({ ...sample, goalsShown: [g], copies: [{ address: A1, goal: g }] })
  assert.ok(t.includes('Steam 20 USD · dddd · saving · 500 NIM · 1 deposit · no unlock steps · changed 13 Nov 22:15'))
})

test('a negative difference shows a minus sign', () => {
  // Total 500, active 2,000 -> difference −1,500
  const g = { id: 'eeee1111', brandName: 'Nike', faceValue: '25', currency: 'USD', status: 'saving', deposits: [{ nim: 500 }], unlockSteps: [], updatedAt: new Date(T_VAL5).toISOString() }
  const t = buildDiagnostics({ ...sample, staker: { active: 2000, inactive: 0, retired: 0, delegation: GARUDA, stakers: [A1] }, goalsShown: [g], copies: [{ address: A1, goal: g }] })
  assert.ok(t.includes('  Total in goals that should be staked: 500'))
  assert.ok(t.includes('  Difference: −1,500 NIM'))
})

test('deposits count: "1 deposit" for exactly one, plural otherwise', () => {
  const one = { id: 'iiii1111', brandName: 'Steam', faceValue: '20', currency: 'USD', status: 'saving', deposits: [{ nim: 500 }], unlockSteps: [], updatedAt: new Date(T_VAL5).toISOString() }
  const none = { id: 'jjjj1111', brandName: 'Nike', faceValue: '25', currency: 'USD', status: 'saving', deposits: [], unlockSteps: [], updatedAt: new Date(T_VAL5).toISOString() }
  const two = { id: 'kkkk1111', brandName: 'Uber', faceValue: '10', currency: 'USD', status: 'saving', deposits: [{ nim: 100 }, { nim: 200 }], unlockSteps: [], updatedAt: new Date(T_VAL5).toISOString() }
  const t = buildDiagnostics({ ...sample, goalsShown: [one, none, two], copies: [] })
  assert.ok(t.includes('· 1 deposit ·'), 'exactly one reads "1 deposit"')
  assert.ok(t.includes('· 0 deposits ·'), 'none reads "0 deposits"')
  assert.ok(t.includes('· 2 deposits ·'), 'two reads "2 deposits"')
  assert.ok(!t.includes('1 deposits'), 'never "1 deposits"')
})

test('Difference is always a whole number: a tiny gap reads "0", never "+0.00034"', () => {
  // Total 2000.00034, active 2000 -> gap 0.00034, which must round to 0
  const g = { id: 'llll1111', brandName: 'Steam', faceValue: '20', currency: 'USD', status: 'saving', deposits: [{ nim: 2000.00034 }], unlockSteps: [], updatedAt: new Date(T_VAL5).toISOString() }
  const t = buildDiagnostics({ ...sample, staker: { active: 2000, inactive: 0, retired: 0, delegation: GARUDA, stakers: [A1] }, goalsShown: [g], copies: [{ address: A1, goal: g }] })
  assert.ok(t.includes('  Difference: 0 NIM'), 'a sub-NIM gap rounds to 0')
  assert.ok(!t.includes('0.00034'))
})

test('a half-hour time zone offset', () => {
  const t = buildDiagnostics({ ...sample, tzOffsetMin: 330 }) // UTC+5:30
  assert.ok(t.includes('(UTC+5:30)'))
  // 14:30 UTC + 5:30 = 20:00 local
  assert.ok(t.includes('15 Nov 2026 20:00 (UTC+5:30)'))
})

test('a negative half-hour time zone offset', () => {
  const t = buildDiagnostics({ ...sample, tzOffsetMin: -210 }) // UTC−3:30
  assert.ok(t.includes('(UTC−3:30)'))
})

test('a NIM figure below 1 keeps decimals', () => {
  const g = { id: 'ffff1111', brandName: 'Uber', faceValue: '10', currency: 'USD', status: 'saving', deposits: [{ nim: 0.5 }], unlockSteps: [], updatedAt: new Date(T_VAL5).toISOString() }
  const t = buildDiagnostics({ ...sample, goalsShown: [g], copies: [{ address: A1, goal: g }] })
  assert.ok(t.includes('· 0.5 NIM ·'))
})

test('a validator that is not Garuda is shortened; a missing one is unknown', () => {
  const other = 'NQ77 ZZZZ YYYY XXXX WWWW VVVV UUUU TTTT SSSS'
  const t1 = buildDiagnostics({ ...sample, staker: { active: 1, inactive: 0, retired: 0, delegation: other, stakers: [A1] } })
  assert.ok(t1.includes('· NQ77 … SSSS'))
  const t2 = buildDiagnostics({ ...sample, staker: { active: 1, inactive: 0, retired: 0, delegation: null, stakers: [A1] } })
  assert.ok(t2.includes('· validator unknown'))
})

test('Payment being checked and Unlock in progress read yes when set', () => {
  const unlocking = { ...valorant5, status: 'unlocking' }
  const t = buildDiagnostics({ ...sample, pendingPay: true, goalsShown: [unlocking], copies: [{ address: A1, goal: unlocking }] })
  assert.ok(t.includes('  Payment being checked: yes'))
  assert.ok(t.includes('  Unlock in progress: yes'))
})

test('NIM put back in staking: the count and the last one, never a hash', () => {
  const t = buildDiagnostics({ ...sample, restakes: { count: 2, last: { at: at(2026, 10, 15, 9, 5), nim: 9078 } } })
  assert.ok(t.includes('  NIM put back in staking: 2 time(s), last 15 Nov 09:05 (9,078 NIM)'))
  assert.ok(!t.includes('tx') && !t.includes('HASH'))
})

// PRIVACY: a state stuffed with private values in every field the builder could reach must never leak them.
test('PRIVACY: no private value, no "@", and no unshortened NQ address appears', () => {
  const SECRETS = [
    'secret@user.com', 'ORDER-abc123', 'tok_live_9f8e7d', 'd4e5f6a1b2c3hashhash', 'swap_zxy987',
    'REDEEM-PIN-4242', 'https://redeem.example/claim/abcdef', '1234pin', 'Alice Example', 'anon-id-deadbeef',
    'my private goal note', 'outbox-secret', 'log-secret-line',
  ]
  const full = 'NQ99 ZZZZ YYYY XXXX WWWW VVVV UUUU TTTT SSSS'
  const fullNoSpace = 'NQ99ZZZZYYYYXXXXWWWWVVVVUUUUTTTTSSSS'
  const poison = (base) => ({
    ...base,
    email: 'secret@user.com',
    itemName: 'secret@user.com Airbnb gift card',
    itemDetail: 'ORDER-abc123',
    note: 'my private goal note',
    payment: { orderId: 'ORDER-abc123', orderToken: 'tok_live_9f8e7d', hash: 'd4e5f6a1b2c3hashhash', swapId: 'swap_zxy987', code: 'REDEEM-PIN-4242', pin: '1234pin', link: 'https://redeem.example/claim/abcdef' },
    deposits: [{ nim: 500, tx: 'd4e5f6a1b2c3hashhash', from: full }],
    unlockSteps: [{ step: 'remove', tx: 'd4e5f6a1b2c3hashhash', at: 1 }],
  })
  const g = poison({ id: 'gggg1111', brandName: 'Steam', faceValue: '20', currency: 'USD', status: 'saving', updatedAt: new Date(T_VAL5).toISOString() })
  const state = {
    version: '1.2.8', now: sample.now, tzOffsetMin: 0, lang: 'en', demo: false,
    accounts: [{ address: full, nim: 5 }, { address: fullNoSpace, nim: 0 }],
    usedAddress: full,
    staker: { active: 10, inactive: 0, retired: 0, delegation: full, stakers: [full, fullNoSpace] },
    validatorAddress: GARUDA,
    goalsShown: [g], copies: [{ address: full, goal: g }, { address: fullNoSpace, goal: poison({ id: 'hhhh1111', brandName: 'Nike', faceValue: '25', currency: 'USD', status: 'ready', unlockSteps: [{}], deposits: [{ nim: 1 }], updatedAt: new Date(T_VAL250).toISOString() }) }],
    pendingPay: true, deletedCount: 1,
    email: 'secret@user.com', name: 'Alice Example', anonId: 'anon-id-deadbeef', log: 'log-secret-line', outbox: 'outbox-secret',
  }
  const text = buildDiagnostics(state)
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `leaked: ${secret}`)
  assert.ok(!text.includes('@'), 'no email at all')
  // no NQ address printed in full (with or without spaces): short() always collapses to first … last
  assert.ok(!/NQ[0-9]{2}(\s?[0-9A-Z]{4}){3,}/.test(text), 'an NQ address is unshortened')
  assert.ok(!text.includes(fullNoSpace), 'a no-space NQ address is unshortened')
})

test('never throws on bad input', () => {
  assert.doesNotThrow(() => buildDiagnostics(undefined))
  assert.doesNotThrow(() => buildDiagnostics({}))
  assert.doesNotThrow(() => buildDiagnostics({ accounts: null, staker: {}, goalsShown: 'nope', copies: 7 }))
})

// --- gather: reads only, through injected deps (Part C) ---

// A localStorage-like fake: data keys are enumerable own props (so Object.keys lists them), the api is not.
function makeStorage(initial = {}) {
  const writes = []
  const obj = {}
  for (const [k, v] of Object.entries(initial)) obj[k] = v
  const def = (name, fn) => Object.defineProperty(obj, name, { value: fn, enumerable: false, configurable: true })
  def('getItem', (k) => (Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : null))
  def('setItem', (k, v) => { writes.push(k); obj[k] = String(v) })
  def('removeItem', (k) => { writes.push(k); delete obj[k] })
  return { storage: obj, writes }
}
const snapshot = (obj) => Object.keys(obj).sort().map((k) => `${k}=${obj[k]}`).join('\n')

test('gather reads a realistic phone and never writes a key', async () => {
  const initial = {
    [`dibs.goals.${A1}`]: JSON.stringify([airbnb, valorant5]),
    [`dibs.goals.${A2}`]: JSON.stringify([valorant250]),
    'dibs:pending': JSON.stringify({ v: 2, id: 'dep-1', nim: 50 }), // the deposit lock (colon key): not read here
    'dibs.pending': JSON.stringify({ kind: 'pay', goalId: airbnb.id }), // the payment-check record (dot key)
    'dibs.deleted': JSON.stringify(['old-1', 'old-2']),
    'dibs.email': 'secret@user.com',
    'dibs.name': 'Alice Example',
    'dibs.anonId': 'anon-id-deadbeef',
    'dibs.stakeBase': '1000',
    'dibs.daily': JSON.stringify({ open: '2026-11-15' }),
    'dibs.badges': JSON.stringify(['first']),
  }
  const { storage, writes } = makeStorage(initial)
  const before = snapshot(storage)

  const calls = { accounts: 0, staker: [] }
  const listAccounts = async () => { calls.accounts++; return [{ address: A1, nim: 17445 }, { address: A2, nim: 0 }] }
  const readStaker = async (addr) => { calls.staker.push(addr); return { balance: 13620 * 100000, inactiveBalance: 0, retiredBalance: 0, delegation: GARUDA, address: A1 } }

  const state = await gather({ storage, now: sample.now, tzOffsetMin: 0, version: '1.2.8', lang: 'en', demo: false, usedAddress: A1, validatorAddress: GARUDA, listAccounts, readStaker })
  const text = buildDiagnostics(state)

  // storage is untouched
  assert.equal(snapshot(storage), before)
  assert.equal(writes.length, 0, 'gather wrote to storage')
  // the injected reads were the only chain calls
  assert.equal(calls.accounts, 1)
  assert.deepEqual(calls.staker, [A1])
  // the gathered state is right and private keys never surface
  assert.equal(state.deletedCount, 2)
  assert.equal(state.pendingPay, true)
  assert.equal(state.copies.length, 3)
  assert.equal(state.goalsShown.length, 2)
  assert.ok(text.includes('active 13,620'))
  assert.ok(text.includes('Garuda Pool'))
  for (const s of ['secret@user.com', 'Alice Example', 'anon-id-deadbeef']) assert.ok(!text.includes(s), `leaked ${s}`)
  assert.ok(!text.includes('@'))
})

test('gather turns a failing read into error for that part only', async () => {
  const { storage } = makeStorage({ [`dibs.goals.${A1}`]: JSON.stringify([airbnb]) })
  const listAccounts = async () => { throw new Error('host older') }
  const readStaker = async () => { throw new Error('rpc down') }
  const state = await gather({ storage, now: sample.now, tzOffsetMin: 0, version: '1.2.8', lang: 'en', demo: false, usedAddress: A1, validatorAddress: GARUDA, listAccounts, readStaker })
  assert.equal(state.accounts, 'error')
  assert.equal(state.staker, 'error')
  assert.equal(state.goalsShown.length, 1) // storage still read
  const text = buildDiagnostics(state)
  assert.ok(text.includes('Wallet addresses: unavailable'))
  assert.ok(text.includes('Staking: unavailable'))
})

test('gather: no staker comes back as a clean null, not an error', async () => {
  const { storage } = makeStorage({})
  const listAccounts = async () => [{ address: A1, nim: 0 }]
  const readStaker = async () => null
  const state = await gather({ storage, now: sample.now, tzOffsetMin: 0, version: '1.2.8', lang: 'en', demo: true, usedAddress: A1, validatorAddress: GARUDA, listAccounts, readStaker })
  assert.equal(state.staker, null)
  assert.ok(buildDiagnostics(state).includes('  no staker'))
})

// v1.2.9: goals live in one key (dibs.goals). It is the shown list, and shows as "main list" in "Every saved copy",
// carrying the "<- shown" mark; the old per-address keys are still listed by their address, unchanged.
test('main list: dibs.goals copies show "main list" and carry the <- shown mark, the old keys do not', () => {
  const state = {
    ...sample,
    goalsShown: [airbnb, valorant5],
    copies: [
      { address: 'main list', main: true, goal: airbnb },
      { address: 'main list', main: true, goal: valorant5 },
      { address: A1, goal: airbnb },
      { address: A2, goal: valorant250 },
    ],
  }
  const lines = buildDiagnostics(state).split('\n')
  const shown = lines.filter((l) => l.includes('<- shown'))
  assert.equal(shown.length, 2)
  assert.ok(shown.every((l) => l.startsWith('  main list  ')), 'the shown copies are the main-list ones')
  // the old per-address copy of the same goal is listed by its address, never marked shown
  assert.ok(lines.some((l) => l.includes('NQ11 … HHHH') && l.includes('Airbnb aaaa') && !l.includes('<- shown')))
})

test('gather: when dibs.goals exists, it is the shown list and appears as "main list"; old keys stay', async () => {
  const initial = {
    'dibs.goals': JSON.stringify([airbnb, valorant5]),
    [`dibs.goals.${A1}`]: JSON.stringify([airbnb, valorant5]),
    [`dibs.goals.${A2}`]: JSON.stringify([valorant250]),
    'dibs.goalsMoved': '2026-11-15T00:00:00.000Z',
  }
  const { storage, writes } = makeStorage(initial)
  const before = snapshot(storage)
  const listAccounts = async () => [{ address: A1, nim: 100 }]
  const readStaker = async () => ({ balance: 0, inactiveBalance: 0, retiredBalance: 0, delegation: GARUDA, address: A1 })
  const state = await gather({ storage, now: sample.now, tzOffsetMin: 0, version: '1.2.9', lang: 'en', demo: false, usedAddress: A1, validatorAddress: GARUDA, listAccounts, readStaker })
  assert.equal(snapshot(storage), before) // never writes
  assert.equal(writes.length, 0)
  assert.equal(state.goalsShown.length, 2) // shown from dibs.goals
  assert.ok(state.copies.some((c) => c.main)) // the main list appears among the copies
  const text = buildDiagnostics(state)
  assert.ok(text.includes('main list'))
  assert.ok(text.includes('NQ11 … HHHH') && text.includes('NQ22 … RRRR')) // old keys still listed by address
  const shown = text.split('\n').filter((l) => l.includes('<- shown'))
  assert.ok(shown.length >= 1 && shown.every((l) => l.startsWith('  main list  ')))
})
