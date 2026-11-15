import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releaseOf, cmpRelease, seenOf, bigSheetFor } from './bigUpdate.js'

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
