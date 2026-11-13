// Profile claim banners (screens/profileView.js claimable) and the strings of the v1.1.5 Profile redesign.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { claimable } from '../screens/profileView.js'
import { PROGRAM_END, REWARD_IDS } from './rewards.js'
import { makeT } from './i18n.js'

const DAY = 864e5
const NOW = Date.parse('2026-11-13T12:00:00Z')
const iso = (ms) => new Date(ms).toISOString()
const goal = (deposits = []) => ({ id: 'g1', status: 'saving', deposits, createdAt: iso(NOW - 30 * DAY), payment: null })
const old = [goal([{ nim: 100, tx: 'aa', at: iso(NOW - 10 * DAY) }])] // first deposit 10 days ago: planted is claimable
const fresh = [goal([{ nim: 100, tx: 'aa', at: iso(NOW - 2 * DAY) }])] // 2 days ago: planted waits
const both = { planted: { at: iso(NOW - 10 * DAY) }, dibs: { at: iso(NOW - DAY) } }

test('no banner when no reward is in claim state', () => {
  assert.deepEqual(claimable({ badges: {}, goals: old, now: NOW }), [])
  assert.deepEqual(claimable({ badges: { planted: both.planted }, goals: fresh, now: NOW }), [])
  assert.deepEqual(claimable({ now: NOW }), [])
})

test('no banner once the rewards program is over, even with rewards to claim', () => {
  const after = Date.parse(PROGRAM_END) + 1000
  assert.deepEqual(claimable({ badges: both, goals: old, now: after }), [])
})

test('one or two banners, in REWARD_IDS order', () => {
  assert.deepEqual(claimable({ badges: { dibs: both.dibs }, goals: old, now: NOW }), ['dibs'])
  assert.deepEqual(claimable({ badges: { planted: both.planted }, goals: old, now: NOW }), ['planted'])
  assert.deepEqual(claimable({ badges: both, goals: old, now: NOW }), REWARD_IDS)
  assert.deepEqual(claimable({ badges: { dibs: both.dibs, planted: both.planted }, goals: old, now: NOW }), ['planted', 'dibs'])
  assert.deepEqual(claimable({ badges: both, goals: fresh, now: NOW }), ['dibs'])
})

const src = readFileSync(new URL('./i18n.js', import.meta.url), 'utf8')
const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const T = { en: makeT('en'), fr: makeT('fr'), es: makeT('es') }

test('the new Profile keys exist in en, fr and es with the same placeholders, no em dash, no "!"', () => {
  for (const k of ['prof_saved_all', 'rw_banner', 'rw_banner_sub', 'rw_claim_pill']) {
    const lines = [...src.matchAll(new RegExp(`^ {2}${k}: "(.*)",$`, 'gm'))].map((m) => m[1])
    assert.equal(lines.length, 3, `${k} is in ${lines.length} languages`)
    for (const l of lines) {
      assert.deepEqual(holes(l), holes(lines[0]), `${k}: placeholders`)
      assert.ok(!l.includes('—') && !l.includes('!'), `${k}: "${l}"`)
    }
  }
  assert.deepEqual(holes(T.en('rw_banner')), ['amount'])
  assert.deepEqual(holes(T.en('rw_banner_sub')), ['badge'])
  assert.equal(T.en('rw_banner', { amount: '1,000' }), '1,000 NIM to claim')
  assert.equal(T.fr('rw_banner_sub', { badge: 'Planté' }), 'Pour le badge Planté')
  assert.equal(T.es('rw_claim_pill'), 'Reclamar')
})

test('the removed Profile keys are gone from every language', () => {
  for (const k of ['prof_intro', 'xp_intro_1', 'xp_intro_2', 'prof_usd', 'prof_earning', 'prof_earned_pill', 'rw_state_claim', 'prof_saved']) {
    assert.ok(!new RegExp(`^ {2}${k}:`, 'm').test(src), k)
  }
})
