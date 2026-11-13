// Savings top card (components/stakeSplit.js): the three display amounts and the bar segments; the v1.1.2 strings.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { splitSegments, stakeSplit } from '../components/stakeSplit.js'
import { makeT } from './i18n.js'

const sum = (s) => s.earning + s.outside + s.unlocking

test('the three amounts add up to total and never go below 0', () => {
  const cases = [
    { total: 1000, other: 200, leaving: 300 },
    { total: 1000, other: 0, leaving: 0 },
    { total: 1000, other: 0, leaving: 1000 },
    { total: 500, other: 400, leaving: 300 }, // ledger and chain disagree for a moment
    { total: 100, other: 150, leaving: 0 },
    { total: 0, other: 0, leaving: 0 },
    { total: 250.5, other: null, leaving: undefined },
  ]
  for (const c of cases) {
    const s = stakeSplit(c)
    assert.ok(Math.abs(sum(s) - c.total) < 1e-9, JSON.stringify(c))
    for (const k of ['earning', 'outside', 'unlocking']) assert.ok(s[k] >= 0, `${k} ${JSON.stringify(c)}`)
  }
  assert.deepEqual(stakeSplit({ total: 1000, other: 200, leaving: 300 }), { total: 1000, earning: 500, outside: 200, unlocking: 300 })
})

test('a segment under 1 NIM is hidden, the others share the width', () => {
  const segs = splitSegments(stakeSplit({ total: 1000.5, other: 0.5, leaving: 400 }))
  assert.deepEqual(segs.map((p) => p.key), ['earning', 'unlocking'])
  assert.ok(Math.abs(segs.reduce((s, p) => s + p.share, 0) - 1) < 1e-9)
  assert.deepEqual(splitSegments(stakeSplit({ total: 0.4, other: 0, leaving: 0 })), [])
  assert.deepEqual(splitSegments(stakeSplit({ total: 300, other: 100, leaving: 100 })).map((p) => p.key), ['earning', 'outside', 'unlocking'])
})

const src = readFileSync(new URL('./i18n.js', import.meta.url), 'utf8')
const T = { en: makeT('en'), fr: makeT('fr'), es: makeT('es') }
const KEYS = ['stake_total_saved', 'stake_row_earning', 'stake_row_other', 'stake_row_other_note', 'stake_row_leaving',
  'stake_row_leaving_note', 'stake_since', 'stake_first_reward', 'stake_first_reward_sub', 'stake_pool', 'stake_pool_sub',
  'stake_unstaking', 'stake_release_in', 'stake_release_in_min', 'week_ahead', 'quest_meta', 'next_close', 'next_close_left']
const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join()

test('the v1.1.2 strings exist in en, fr and es with the same placeholders, no em dash', () => {
  for (const k of KEYS) {
    assert.equal([...src.matchAll(new RegExp(`^ {2}${k}:`, 'gm'))].length, 3, k)
    for (const l of ['fr', 'es']) assert.equal(holes(T[l](k)), holes(T.en(k)), `${k} ${l}`)
    for (const l of ['en', 'fr', 'es']) assert.ok(!T[l](k).includes('—'), `${k} ${l}`)
  }
})

test('"!" only in week_ahead, the one approved exception', () => {
  for (const k of KEYS.filter((x) => x !== 'week_ahead')) for (const l of ['en', 'fr', 'es']) assert.ok(!T[l](k).includes('!'), `${k} ${l}`)
  for (const l of ['en', 'fr', 'es']) assert.ok(T[l]('week_ahead').endsWith('!'), l)
})

test('the removed Savings strings are gone in all three languages', () => {
  for (const k of ['stake_earned_first', 'stake_earned_stopped', 'stake_earned_partial', 'stake_other_note', 'stake_total', 'stake_validator', 'stake_other', 'quest_title']) {
    assert.equal([...src.matchAll(new RegExp(`^ {2}${k}:`, 'gm'))].length, 0, k)
  }
})
