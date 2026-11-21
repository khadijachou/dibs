import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releaseOf, cmpRelease, seenOf, bigSheetFor, catchUp14, verParts, cmpVer, seenVer } from './bigUpdate.js'
import { NEWS as REAL_NEWS } from './news.js'

test('releaseOf keeps the first two numbers as a string', () => {
  assert.equal(releaseOf('1.3.0'), '1.3')
  assert.equal(releaseOf('1.2.7'), '1.2')
  assert.equal(releaseOf('1.3'), '1.3')
  assert.equal(releaseOf('2.0.1'), '2.0')
  assert.equal(releaseOf('1.10.4'), '1.10')
})

test('releaseOf returns null for bad input', () => {
  for (const bad of ['1', '', 'x.y', '1.', '.2', 'v1.2', null, undefined, 1.2, {}, '1.x']) {
    assert.equal(releaseOf(bad), null, String(bad))
  }
})

test('cmpRelease compares numerically, not as text', () => {
  assert.ok(cmpRelease('1.10', '1.9') > 0) // 10 is newer than 9
  assert.ok(cmpRelease('2.0', '1.9') > 0)
  assert.ok(cmpRelease('1.3', '1.3') === 0)
  assert.ok(cmpRelease('1.2', '1.3') < 0)
})

test('seenOf: a valid stored release wins', () => {
  assert.equal(seenOf('1.3', true), '1.3')
  assert.equal(seenOf('1.1', true), '1.1')
  assert.equal(seenOf('1.3.2', true), '1.3') // normalised to its release
})

test('seenOf: missing or invalid on an onboarded phone counts as 1.2', () => {
  assert.equal(seenOf(null, true), '1.2')
  assert.equal(seenOf(undefined, true), '1.2')
  assert.equal(seenOf('junk', true), '1.2')
  assert.equal(seenOf('', true), '1.2')
})

test('seenOf: never onboarded is null', () => {
  assert.equal(seenOf('1.3', false), null)
  assert.equal(seenOf(null, false), null)
})

// A small NEWS stand-in. 1.3 and 1.4 carry a sheet; 1.3.1 is a patch with no sheet.
const SHEET = [{ icon: 'gift', title: 'k_t', line: 'k_l' }]
const NEWS = [
  { v: '1.4.0', sheet: SHEET },
  { v: '1.3.1' },
  { v: '1.3', sheet: SHEET },
  { v: '1.2.7' },
  { v: '1.2', sheet: SHEET },
  { v: '1.1' },
]

test('same release: no sheet', () => {
  assert.equal(bigSheetFor({ version: '1.3.4', stored: '1.3', onboarded: true, news: NEWS }), null)
})

test('a patch bump within a release does not show it', () => {
  // seen 1.3, app 1.3.1: still release 1.3, nothing newer.
  assert.equal(bigSheetFor({ version: '1.3.1', stored: '1.3', onboarded: true, news: NEWS }), null)
})

test('a minor bump shows the release sheet', () => {
  const r = bigSheetFor({ version: '1.3.0', stored: '1.2', onboarded: true, news: NEWS })
  assert.equal(r?.release, '1.3')
  assert.equal(r?.entry.v, '1.3')
  assert.equal(r?.since, null)
})

test('a major bump shows the release sheet', () => {
  const news = [{ v: '2.0', sheet: SHEET }, { v: '1.9' }]
  const r = bigSheetFor({ version: '2.0.1', stored: '1.9', onboarded: true, news })
  assert.equal(r?.release, '2.0')
  assert.equal(r?.since, null)
})

test('two-digit minor is newer: 1.10 over 1.9', () => {
  const news = [{ v: '1.10', sheet: SHEET }, { v: '1.9' }]
  const r = bigSheetFor({ version: '1.10.0', stored: '1.9', onboarded: true, news })
  assert.equal(r?.release, '1.10')
})

test('missing stored on an onboarded phone counts as 1.2', () => {
  // app 1.2.7: release 1.2 is not newer than the assumed 1.2 -> null.
  assert.equal(bigSheetFor({ version: '1.2.7', stored: null, onboarded: true, news: NEWS }), null)
  // app 1.3.0: shows the 1.3 sheet.
  const r = bigSheetFor({ version: '1.3.0', stored: null, onboarded: true, news: NEWS })
  assert.equal(r?.release, '1.3')
})

test('not onboarded: never a sheet', () => {
  assert.equal(bigSheetFor({ version: '1.3.0', stored: '1.2', onboarded: false, news: NEWS }), null)
  assert.equal(bigSheetFor({ version: '1.3.0', stored: null, onboarded: false, news: NEWS }), null)
})

test('skipped releases: newest sheet, oldest unseen as since', () => {
  // seen 1.2, app 1.4.0, NEWS has 1.3 and 1.4 -> { release: 1.4, since: 1.3 }.
  const r = bigSheetFor({ version: '1.4.0', stored: '1.2', onboarded: true, news: NEWS })
  assert.equal(r?.release, '1.4')
  assert.equal(r?.entry.v, '1.4.0')
  assert.equal(r?.since, '1.3')
})

test('a release whose entry has no sheet returns null (saves nothing, retried later)', () => {
  const news = [{ v: '1.3' }, { v: '1.2', sheet: SHEET }] // 1.3 has no sheet yet
  assert.equal(bigSheetFor({ version: '1.3.0', stored: '1.2', onboarded: true, news }), null)
})

test('an empty sheet array returns null', () => {
  const news = [{ v: '1.3', sheet: [] }, { v: '1.2' }]
  assert.equal(bigSheetFor({ version: '1.3.0', stored: '1.2', onboarded: true, news }), null)
})

test('a bad version string returns null', () => {
  assert.equal(bigSheetFor({ version: 'oops', stored: '1.2', onboarded: true, news: NEWS }), null)
  assert.equal(bigSheetFor({ version: '1', stored: '1.2', onboarded: true, news: NEWS }), null)
  assert.equal(bigSheetFor({ version: null, stored: '1.2', onboarded: true, news: NEWS }), null)
})

test('never throws on junk input', () => {
  assert.doesNotThrow(() => bigSheetFor())
  assert.doesNotThrow(() => bigSheetFor({}))
  assert.doesNotThrow(() => bigSheetFor({ version: '1.3.0', stored: {}, onboarded: true, news: 'nope' }))
  assert.equal(bigSheetFor({ version: '1.3.0', stored: '1.2', onboarded: true, news: null }), null)
})

// ---- v1.6.2: the 1.6 sheet (news_52) comes back for phones that missed it since 1.5 ----------------------------------
// It never showed for 1.5 or 1.6 (those NEWS entries carried no sheet), so this release puts it on the 1.6 entry and the
// app at 1.6.2 reaches it. The entry chosen is the 1.6 one, not 1.6.1 or 1.6.2 (which have no sheet).

test('v1.6.2: a phone that last saw 1.4 sees the 1.6 sheet (1.5 had no sheet, so no "since")', () => {
  const r = bigSheetFor({ version: '1.6.2', stored: '1.4', onboarded: true, news: REAL_NEWS })
  assert.equal(r?.release, '1.6')
  assert.equal(r?.entry.v, '1.6')
  assert.ok(Array.isArray(r?.entry.sheet) && r.entry.sheet.length === 3)
  assert.equal(r?.since, null) // only sheet-carrying entries count for "since", and 1.5 carries none
})

test('v1.6.2: a phone that last saw 1.5 sees the 1.6 sheet, no "since"', () => {
  const r = bigSheetFor({ version: '1.6.2', stored: '1.5', onboarded: true, news: REAL_NEWS })
  assert.equal(r?.release, '1.6')
  assert.equal(r?.entry.v, '1.6')
  assert.equal(r?.since, null)
})

test('v1.6.2: a fresh phone (saw 1.6) and a phone that saw 1.6.1 never see it', () => {
  assert.equal(bigSheetFor({ version: '1.6.2', stored: '1.6', onboarded: true, news: REAL_NEWS }), null)
  assert.equal(bigSheetFor({ version: '1.6.2', stored: '1.6.1', onboarded: true, news: REAL_NEWS }), null)
})

test('v1.6.2: a brand-new (not onboarded) user never sees it', () => {
  assert.equal(bigSheetFor({ version: '1.6.2', stored: null, onboarded: false, news: REAL_NEWS }), null)
})

// ---- catchUp14 (v1.4.1): show the 1.4 sheet once to phones that missed it --------------------------------------
const NEWS14 = [{ v: '1.4.1' }, { v: '1.4', sheet: ['a', 'b', 'c'] }, { v: '1.3', sheet: ['x'] }]
const base14 = { stored: '1.4', seen14b: null, friendsEnabled: true, friendsState: null, onboarded: true, news: NEWS14 }

test('catchUp14 shows the 1.4 sheet when the four conditions hold (and picks the 1.4 entry, not 1.4.1)', () => {
  const r = catchUp14(base14)
  assert.ok(r)
  assert.equal(r.release, '1.4')
  assert.equal(r.entry.v, '1.4')
  assert.ok(Array.isArray(r.entry.sheet))
  assert.equal(r.since, null)
})

test('catchUp14 does not show when Friends was turned on (friendsState not null)', () => {
  assert.equal(catchUp14({ ...base14, friendsState: { id: 'u1' } }), null)
})

test('catchUp14 does not show when seen14b is set', () => {
  assert.equal(catchUp14({ ...base14, seen14b: '1' }), null)
})

test('catchUp14 does not show when stored is not 1.4', () => {
  assert.equal(catchUp14({ ...base14, stored: '1.3' }), null)
  assert.equal(catchUp14({ ...base14, stored: null }), null)
})

test('catchUp14 does not show when friendsEnabled is false', () => {
  assert.equal(catchUp14({ ...base14, friendsEnabled: false }), null)
})

test('catchUp14 does not show when not onboarded', () => {
  assert.equal(catchUp14({ ...base14, onboarded: false }), null)
})

test('catchUp14 never throws on junk input', () => {
  assert.doesNotThrow(() => catchUp14())
  assert.equal(catchUp14({ stored: '1.4', friendsEnabled: true, onboarded: true, news: 'nope' }), null)
})

// ---- v1.7.1: the sheet is chosen by FULL version, and dibs.bigSeen stores a full version -----------------------------

test('verParts keeps three numbers, a missing patch counting as 0', () => {
  assert.deepEqual(verParts('1.7.1'), [1, 7, 1])
  assert.deepEqual(verParts('1.7'), [1, 7, 0])
  assert.deepEqual(verParts('1.10.4'), [1, 10, 4])
  for (const bad of ['1', '', 'x.y', 'v1.2', null, undefined, 1.2, {}, '1.x.0']) assert.equal(verParts(bad), null, String(bad))
})

test('cmpVer compares full versions numerically; "1.7" equals "1.7.0"', () => {
  assert.ok(cmpVer('1.7.1', '1.7') > 0)
  assert.ok(cmpVer('1.7', '1.7.0') === 0)
  assert.ok(cmpVer('1.10.0', '1.9.9') > 0)
  assert.ok(cmpVer('1.7.1', '1.7.2') < 0)
})

test('seenVer: a valid stored version wins, missing/invalid on an onboarded phone counts as 1.2.0', () => {
  assert.equal(seenVer('1.7.1', true), '1.7.1')
  assert.equal(seenVer('1.7', true), '1.7') // counts as 1.7.0 via cmpVer
  assert.equal(seenVer(null, true), '1.2.0')
  assert.equal(seenVer('junk', true), '1.2.0')
  assert.equal(seenVer('1.7.1', false), null)
})

test('saw 1.7 then runs 1.7.1 with a sheet: it shows', () => {
  const r = bigSheetFor({ version: '1.7.1', stored: '1.7', onboarded: true, news: REAL_NEWS })
  assert.equal(r?.version, '1.7.1')
  assert.equal(r?.entry.v, '1.7.1')
  assert.equal(r?.since, null)
})

test('saw 1.7.1 then runs 1.7.2 without a sheet: nothing', () => {
  assert.equal(bigSheetFor({ version: '1.7.2', stored: '1.7.1', onboarded: true, news: REAL_NEWS }), null)
})

test('saw 1.6 then runs 1.7.1: shows 1.7.1 with "since 1.7"', () => {
  const r = bigSheetFor({ version: '1.7.1', stored: '1.6', onboarded: true, news: REAL_NEWS })
  assert.equal(r?.version, '1.7.1')
  assert.equal(r?.entry.v, '1.7.1')
  assert.equal(r?.since, '1.7')
})

test('a new user (onboarding stored the current full version) sees nothing', () => {
  assert.equal(bigSheetFor({ version: '1.7.1', stored: '1.7.1', onboarded: true, news: REAL_NEWS }), null)
  assert.equal(bigSheetFor({ version: '1.7.1', stored: null, onboarded: false, news: REAL_NEWS }), null)
})
