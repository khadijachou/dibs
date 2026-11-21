import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanName, cleanVisibility, cleanLook, fullVisibility, applyShared, pruneShared, visibleProfile, sharesNothing, sharedHasError, ITEMS, cleanGiftMessage, cleanGiftBanner } from './rules.js'

test('cleanGiftMessage: trims, turns line breaks into spaces, bounds at 140 code points', () => {
  assert.equal(cleanGiftMessage('  Happy birthday  '), 'Happy birthday')
  assert.equal(cleanGiftMessage('line one\nline two'), 'line one line two')
  assert.equal(cleanGiftMessage('a\r\nb\tc'), 'a b c')
  assert.equal(cleanGiftMessage(''), '') // empty = no message
  assert.equal(cleanGiftMessage('   '), '')
  assert.equal(cleanGiftMessage(undefined), '')
  assert.equal(cleanGiftMessage(null), '')
  assert.equal(cleanGiftMessage(42), null)
  assert.equal(cleanGiftMessage('x'.repeat(140)), 'x'.repeat(140))
  assert.equal(cleanGiftMessage('x'.repeat(141)), null)
  assert.equal(cleanGiftMessage('🎉'.repeat(140)), '🎉'.repeat(140)) // counted by code points, not UTF-16 units
  assert.equal(cleanGiftMessage('🎉'.repeat(141)), null)
})

test('cleanGiftMessage: refuses anything that looks like a link', () => {
  for (const bad of ['see http://x', 'HTTPS everywhere', 'go to www.site', 'WWW.SITE', 'buy at shop.com/deal', 'a b.co/x']) {
    assert.equal(cleanGiftMessage(bad), null, bad)
  }
  // a bare dot in a sentence is fine (no slash after a tld)
  assert.equal(cleanGiftMessage('Thanks a lot. Enjoy it.'), 'Thanks a lot. Enjoy it.')
  assert.equal(cleanGiftMessage('5.0 stars for you'), '5.0 stars for you')
})

test('cleanGiftBanner: one of the four, or empty for none/absent, null otherwise', () => {
  for (const ok of ['birthday', 'thanks', 'congrats', 'because']) assert.equal(cleanGiftBanner(ok), ok)
  assert.equal(cleanGiftBanner('none'), '')
  assert.equal(cleanGiftBanner(undefined), '')
  assert.equal(cleanGiftBanner(null), '')
  assert.equal(cleanGiftBanner('party'), null)
  assert.equal(cleanGiftBanner(42), null)
})

test('cleanName: trims, strips control chars and angle brackets, bounds length', () => {
  assert.equal(cleanName('  Aziz  '), 'Aziz')
  assert.equal(cleanName('a\nb\tc'), 'abc')
  assert.equal(cleanName('<script>'), 'script')
  assert.equal(cleanName(''), null)
  assert.equal(cleanName('   '), null)
  assert.equal(cleanName('x'.repeat(25)), null)
  assert.equal(cleanName('x'.repeat(24)), 'x'.repeat(24))
  assert.equal(cleanName(42), null)
})

test('cleanVisibility: keeps only known items and values', () => {
  assert.deepEqual(cleanVisibility({ level: 'friends', badges: 'everyone', cards: 'off', nope: 'everyone', goals: 'bad' }), { level: 'friends', badges: 'everyone', cards: 'off' })
  assert.deepEqual(cleanVisibility(null), {})
})

test('fullVisibility: every item defaults to off (seven items)', () => {
  assert.deepEqual(fullVisibility({ level: 'friends' }), { avatar: 'off', level: 'friends', badges: 'off', totals: 'off', goals: 'off', cards: 'off', wishlist: 'off' })
})

test('cleanLook: validates accent and frame, drops the rest', () => {
  assert.deepEqual(cleanLook({ accent: 'coral', frame: 'ring_1', extra: 'x' }), { accent: 'coral', frame: 'ring_1' })
  assert.deepEqual(cleanLook({ accent: 'NOPE UPPER' }), {})
  assert.deepEqual(cleanLook({ accent: 'x'.repeat(17) }), {})
})

test('applyShared: drops anything sent for an off item, validates the rest', () => {
  const vis = fullVisibility({ level: 'friends', badges: 'everyone', cards: 'off', goals: 'friends', wishlist: 'friends' })
  const out = applyShared({}, {
    level: { level: 7, rank: 'saver' },
    badges: ['first', 'planted', 'BAD KEY'],
    cards: ['steam'], // off -> dropped
    goals: [{ brandKey: 'steam', pct: 40 }, { brandKey: 'x', pct: 200 }],
    wishlist: ['amazon'],
  }, vis)
  assert.deepEqual(out.level, { level: 7, rank: 'saver' })
  assert.deepEqual(out.badges, ['first', 'planted'])
  assert.equal(out.cards, undefined) // off item never stored
  assert.deepEqual(out.goals, [{ brandKey: 'steam', pct: 40 }])
  assert.deepEqual(out.wishlist, ['amazon'])
})

test('applyShared: validation bounds (level, counts, pct)', () => {
  const vis = fullVisibility({ level: 'friends', badges: 'friends', goals: 'friends' })
  assert.equal(applyShared({}, { level: { level: 0, rank: 'saver' } }, vis).level, undefined)
  assert.equal(applyShared({}, { level: { level: 1000, rank: 'saver' } }, vis).level, undefined)
  assert.equal(applyShared({}, { level: { level: 5, rank: 'Bad Rank' } }, vis).level, undefined)
  assert.equal(applyShared({}, { badges: Array.from({ length: 80 }, (_, i) => 'b' + i) }, vis).badges.length, 60)
  assert.equal(applyShared({}, { goals: Array.from({ length: 20 }, () => ({ brandKey: 'steam', pct: 10 })) }, vis).goals.length, 12)
})

test('pruneShared: removes items turned off', () => {
  const current = { level: { level: 3, rank: 'saver' }, badges: ['first'], cards: ['steam'] }
  const vis = fullVisibility({ level: 'friends', badges: 'off', cards: 'everyone' })
  assert.deepEqual(pruneShared(current, vis), { level: { level: 3, rank: 'saver' }, cards: ['steam'] })
})

const owner = () => ({
  id: 'abcd1234',
  name: 'Aziz',
  visibility: fullVisibility({ level: 'friends', badges: 'everyone', cards: 'off', goals: 'friends', wishlist: 'off' }),
  shared: { level: { level: 9, rank: 'planner' }, badges: ['first'], goals: [{ brandKey: 'steam', pct: 50 }], cards: ['zzsecretbrand'] },
  look: { accent: 'coral' },
})

test('visibleProfile self: everything plus the visibility map', () => {
  const p = visibleProfile(owner(), 'self')
  assert.equal(p.id, 'abcd1234')
  assert.equal(p.seed, 'abcd1234')
  assert.deepEqual(p.visibility, owner().visibility)
  assert.ok(p.level && p.badges && p.goals)
  assert.equal(p.hidden, undefined)
})

test('visibleProfile stranger: only name and seed, no data keys', () => {
  const p = visibleProfile(owner(), 'stranger')
  assert.deepEqual(p, { id: 'abcd1234', name: 'Aziz', seed: 'abcd1234' })
  for (const k of ITEMS) assert.ok(!(k in p))
  assert.equal('visibility' in p, false)
  assert.equal('look' in p, false)
})

test('visibleProfile friend: friends/everyone items shown, off items only named in hidden', () => {
  const p = visibleProfile(owner(), 'friend')
  assert.deepEqual(p.level, { level: 9, rank: 'planner' })
  assert.deepEqual(p.badges, ['first'])
  assert.deepEqual(p.goals, [{ brandKey: 'steam', pct: 50 }])
  // cards and wishlist are off: absent from the JSON, not just empty
  assert.equal('cards' in p, false)
  assert.equal('wishlist' in p, false)
  assert.deepEqual(p.hidden.sort(), ['cards', 'totals', 'wishlist']) // avatar is off too but is never a hidden line
  assert.ok(!p.hidden.includes('avatar'))
  assert.equal('visibility' in p, false)
  // hidden data truly absent from the serialized JSON (the off card value never appears)
  const s = JSON.stringify(p)
  assert.ok(!s.includes('zzsecretbrand'))
})

test('visibleProfile friend: an on item with no uploaded data is simply absent', () => {
  const o = owner()
  o.shared = { badges: ['first'] } // level is "friends" but nothing uploaded
  const p = visibleProfile(o, 'friend')
  assert.equal('level' in p, false)
  assert.ok(!p.hidden.includes('level')) // on, just empty, so not "hidden"
})

test('sharesNothing: true only when every item is off', () => {
  assert.equal(sharesNothing(fullVisibility({})), true)
  assert.equal(sharesNothing(fullVisibility({ level: 'friends' })), false)
})

// ---- v1.4.2: avatar, totals, card/goal values -----------------------------------------------------------------
const SVG = 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64')
const PNG = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64')

test('applyShared: avatar stored as-is when on and valid, dropped when off', () => {
  const vis = fullVisibility({ avatar: 'friends' })
  assert.equal(applyShared({}, { avatar: SVG }, vis).avatar, SVG)
  assert.equal(applyShared({}, { avatar: SVG }, fullVisibility({})).avatar, undefined) // off -> dropped
})

test('applyShared: totals keeps saved and optional earned, drops extras', () => {
  const vis = fullVisibility({ totals: 'friends' })
  assert.deepEqual(applyShared({}, { totals: { saved: 100, earned: 7, junk: 9 } }, vis).totals, { saved: 100, earned: 7 })
  assert.deepEqual(applyShared({}, { totals: { saved: 100 } }, vis).totals, { saved: 100 })
})

test('applyShared: cards stored as objects, old string shape upgraded, duplicates kept, values kept', () => {
  const vis = fullVisibility({ cards: 'friends' })
  const out = applyShared({}, { cards: ['steam', { brandKey: 'steam', value: '20 USD' }, { brandKey: 'steam', value: '20 USD' }, { brandKey: 'netflix' }] }, vis)
  assert.deepEqual(out.cards, [{ brandKey: 'steam' }, { brandKey: 'steam', value: '20 USD' }, { brandKey: 'steam', value: '20 USD' }, { brandKey: 'netflix' }])
})

test('applyShared: goals keep an optional value', () => {
  const vis = fullVisibility({ goals: 'friends' })
  assert.deepEqual(applyShared({}, { goals: [{ brandKey: 'steam', pct: 40, value: '25 EUR' }, { brandKey: 'netflix', pct: 10 }] }, vis).goals,
    [{ brandKey: 'steam', pct: 40, value: '25 EUR' }, { brandKey: 'netflix', pct: 10 }])
})

test('sharedHasError: strict for totals, avatar and a present value; silent for the old shapes', () => {
  const vis = fullVisibility({ totals: 'friends', avatar: 'friends', cards: 'friends', goals: 'friends', badges: 'friends' })
  // good
  assert.equal(sharedHasError({ totals: { saved: 1 }, avatar: SVG, cards: [{ brandKey: 'steam', value: '20 USD' }] }, vis), false)
  // totals bad
  assert.equal(sharedHasError({ totals: { saved: -1 } }, vis), true)
  assert.equal(sharedHasError({ totals: { saved: 1.5 } }, vis), true)
  assert.equal(sharedHasError({ totals: { earned: 5 } }, vis), true) // saved required
  assert.equal(sharedHasError({ totals: 'nope' }, vis), true)
  // avatar bad
  assert.equal(sharedHasError({ avatar: 'data:image/gif;base64,AAAA' }, vis), true) // wrong type
  assert.equal(sharedHasError({ avatar: 'data:image/png;base64,***' }, vis), true) // not base64
  assert.equal(sharedHasError({ avatar: 'data:image/png;base64,' + 'A'.repeat(13000) }, vis), true) // too long
  // value present but bad -> error; bad brandKey or pct stays silent (no error)
  assert.equal(sharedHasError({ cards: [{ brandKey: 'steam', value: 'bad<>' }] }, vis), true)
  assert.equal(sharedHasError({ goals: [{ brandKey: 'steam', pct: 10, value: 'x'.repeat(30) }] }, vis), true)
  assert.equal(sharedHasError({ cards: ['steam'], badges: ['BAD KEY'], goals: [{ brandKey: 'x', pct: 999 }] }, vis), false)
  // off item is never a strict error
  assert.equal(sharedHasError({ totals: 'nope' }, fullVisibility({})), false)
})

test('pruneShared: removes avatar and totals when turned off', () => {
  const current = { avatar: SVG, totals: { saved: 5 }, level: { level: 3, rank: 'saver' } }
  const vis = fullVisibility({ avatar: 'off', totals: 'friends', level: 'friends' })
  assert.deepEqual(pruneShared(current, vis), { totals: { saved: 5 }, level: { level: 3, rank: 'saver' } })
})

test('visibleProfile friend: avatar and totals shown when on, avatar never in hidden', () => {
  const o = { id: 'x', name: 'A', visibility: fullVisibility({ avatar: 'friends', totals: 'friends' }), shared: { avatar: PNG, totals: { saved: 9 } } }
  const p = visibleProfile(o, 'friend')
  assert.equal(p.avatar, PNG)
  assert.deepEqual(p.totals, { saved: 9 })
  assert.ok(!p.hidden.includes('avatar'))
  // avatar off: not shown, still not in hidden
  const o2 = { id: 'x', name: 'A', visibility: fullVisibility({ totals: 'friends' }), shared: { totals: { saved: 9 } } }
  const p2 = visibleProfile(o2, 'friend')
  assert.equal('avatar' in p2, false)
  assert.ok(!p2.hidden.includes('avatar'))
})

test('visibleProfile stranger: still only id, name, seed (no avatar, no totals)', () => {
  const o = { id: 'x', name: 'A', visibility: fullVisibility({ avatar: 'everyone', totals: 'everyone' }), shared: { avatar: PNG, totals: { saved: 9 } } }
  assert.deepEqual(visibleProfile(o, 'stranger'), { id: 'x', name: 'A', seed: 'x' })
})

test('sharesNothing counts the seven items', () => {
  assert.equal(sharesNothing(fullVisibility({})), true)
  assert.equal(sharesNothing(fullVisibility({ avatar: 'friends' })), false)
  assert.equal(sharesNothing(fullVisibility({ totals: 'everyone' })), false)
})
