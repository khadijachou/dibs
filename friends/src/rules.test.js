import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanName, cleanVisibility, cleanLook, fullVisibility, applyShared, pruneShared, visibleProfile, sharesNothing, ITEMS } from './rules.js'

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

test('fullVisibility: every item defaults to off', () => {
  assert.deepEqual(fullVisibility({ level: 'friends' }), { level: 'friends', badges: 'off', cards: 'off', goals: 'off', wishlist: 'off' })
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
  assert.deepEqual(p.hidden.sort(), ['cards', 'wishlist'])
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
