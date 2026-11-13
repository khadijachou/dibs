// Weekly streak row in the Profile level card (screens/profileView.js streakView): the text from rhythm().weeks,
// the bonus from rhythm().level, the lit bars = level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STREAK_BARS, streakView } from '../screens/profileView.js'
import { makeT } from './i18n.js'

const NB = String.fromCharCode(0xa0)
const plain = (s) => s && s.replaceAll(NB, ' ')
const T = { en: makeT('en'), fr: makeT('fr'), es: makeT('es') }
const WANT = {
  en: { 0: 'Open Dibs each week for up to +50% XP', 1: '1 week in a row', 3: '3 weeks in a row', bonus: '+30% XP' },
  fr: { 0: 'Ouvrez Dibs chaque semaine : jusqu’à +50 % d’XP', 1: '1 semaine de suite', 3: '3 semaines de suite', bonus: '+30 % XP' },
  es: { 0: 'Abre Dibs cada semana: hasta +50 % de XP', 1: '1 semana seguida', 3: '3 semanas seguidas', bonus: '+30 % XP' },
}

test('streak text for 0, 1 and 3 weeks in en, fr and es', () => {
  for (const l of ['en', 'fr', 'es']) {
    assert.equal(plain(streakView({ level: 0, weeks: 0 }, T[l]).text), WANT[l][0], `${l} 0`)
    assert.equal(plain(streakView({ level: 1, weeks: 1 }, T[l]).text), WANT[l][1], `${l} 1`)
    assert.equal(plain(streakView({ level: 3, weeks: 3 }, T[l]).text), WANT[l][3], `${l} 3`)
    assert.equal(plain(streakView({ level: 3, weeks: 3 }, T[l]).bonus), WANT[l].bonus, `${l} bonus`)
  }
})

test('no weeks: the invitation, no bonus; weeks with level 0: no bonus part', () => {
  const none = streakView({ level: 0, weeks: 0 }, T.en)
  assert.ok(none.none)
  assert.equal(none.bonus, null)
  const restart = streakView({ level: 0, weeks: 2 }, T.en)
  assert.equal(restart.text, '2 weeks in a row')
  assert.equal(restart.bonus, null)
})

test('level and weeks can differ: bars follow the level, text follows the weeks', () => {
  const v = streakView({ level: 2, weeks: 1 }, T.en)
  assert.equal(v.lit, 2)
  assert.equal(v.text, '1 week in a row')
  assert.equal(v.bonus, '+20% XP')
})

test('lit bars = level, out of 5, +10% XP per level', () => {
  assert.equal(STREAK_BARS, 5)
  for (let level = 0; level <= 5; level++) {
    const v = streakView({ level, weeks: 6 }, T.en)
    assert.equal(v.lit, level)
    assert.equal(v.bonus, level ? `+${level * 10}% XP` : null)
  }
  assert.equal(streakView({ level: 7, weeks: 9 }, T.en).lit, 5)
  assert.equal(streakView(undefined, T.en).lit, 0)
})

test('the streak keys exist in en, fr and es, with no em dash and no "!"', () => {
  for (const k of ['xp_streak', 'xp_streak_one', 'xp_streak_bonus', 'xp_streak_none']) {
    for (const l of ['en', 'fr', 'es']) {
      const s = T[l](k, { weeks: 4, pct: 40 })
      assert.ok(s && s !== k, `${k} ${l}`)
      assert.ok(!s.includes('—') && !s.includes('!'), `${k} ${l}: ${s}`)
    }
  }
  assert.ok(T.en('xp_streak', { weeks: 4 }).includes('4'))
  assert.ok(T.fr('xp_streak_bonus', { pct: 40 }).includes('40'))
})

test('rhythm_pill is gone from every language', async () => {
  const { readFileSync } = await import('node:fs')
  assert.ok(!/^ {2}rhythm_pill:/m.test(readFileSync(new URL('./i18n.js', import.meta.url), 'utf8')))
})
