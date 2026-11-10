import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duplicateMessage, duplicateText } from './duplicate.js'
import { makeT } from './i18n.js'

const goal = (status) => ({ id: 'g', itemId: 'steam-5', itemName: 'Steam gift card', itemDetail: '5 USD', status, deposits: [] })
const RELEASE = Date.UTC(2026, 10, 10, 18, 30)
const waiting = { state: 'waiting', releaseAt: RELEASE }
const time = () => '18:30'
const say = (lang, place, g, us) => duplicateText(makeT(lang), g, duplicateMessage(place, g, us), time)

test('saving or reached goal: the plain message for each place', () => {
  for (const [place, key] of [['new', 'goal_exists'], ['change', 'change_exists'], ['merge', 'goal_duplicate']]) {
    assert.equal(duplicateMessage(place, goal('saving'), null).key, key)
    assert.equal(duplicateMessage(place, goal('saving'), waiting).key, key, 'a saving goal never takes an unlock message')
  }
  assert.equal(say('en', 'new', goal('saving'), null), 'You already have a goal for this card. Here it is. Finish it first, then you can start a new one.')
})

test('unlock waiting: "is unlocking" with the release time from getUnlockState, in all three places', () => {
  for (const place of ['new', 'change', 'merge']) {
    const msg = duplicateMessage(place, goal('unlocking'), waiting)
    assert.deepEqual(msg, { key: 'dup_unlocking', releaseAt: RELEASE })
  }
  assert.equal(say('en', 'new', goal('unlocking'), waiting), 'Your Steam gift card is unlocking. Ready around 18:30.')
  assert.equal(say('fr', 'new', goal('unlocking'), waiting), 'Votre carte-cadeau Steam est en cours de déblocage. Disponible vers 18:30.')
  assert.equal(say('es', 'new', goal('unlocking'), waiting), 'Tu tarjeta de regalo Steam se está desbloqueando. Disponible alrededor de las 18:30.')
})

test('unlock ready or remove (and NIM back, paying): "is ready, finish getting it here"', () => {
  for (const state of ['ready', 'remove', 'pay']) {
    for (const status of ['unlocking', 'ready']) assert.equal(duplicateMessage('change', goal(status), { state, releaseAt: null }).key, 'dup_ready', `${status}/${state}`)
  }
  assert.equal(say('en', 'merge', goal('unlocking'), { state: 'ready' }), 'Your Steam gift card is ready. Finish getting it here.')
  assert.equal(say('fr', 'merge', goal('unlocking'), { state: 'remove' }), 'Votre carte-cadeau Steam est disponible. Terminez de l’obtenir ici.')
  assert.equal(say('es', 'merge', goal('unlocking'), { state: 'ready' }), 'Tu tarjeta de regalo Steam ya está disponible. Termina de obtenerla aquí.')
})

test('unlocking but the chain was not read, or no release time yet: the plain message, never a guess', () => {
  assert.equal(duplicateMessage('new', goal('unlocking'), null).key, 'goal_exists')
  assert.equal(duplicateMessage('new', goal('unlocking'), { state: 'waiting', releaseAt: null }).key, 'goal_exists')
  assert.equal(duplicateMessage('change', goal('unlocking'), { state: 'stake' }).key, 'change_exists')
})

test('every duplicate key exists in en, fr and es, with the same placeholders and no em dash', () => {
  for (const key of ['goal_exists', 'change_exists', 'goal_duplicate', 'dup_unlocking', 'dup_ready', 'change_exists_open']) {
    const texts = ['en', 'fr', 'es'].map((l) => makeT(l)(key, { name: '{name}', time: '{time}' }))
    for (const s of texts) {
      assert.notEqual(s, key, key)
      assert.ok(!s.includes('—'), key)
    }
    const holes = texts.map((s) => (s.match(/\{\w+\}/g) || []).sort().join())
    assert.equal(new Set(holes).size, 1, key)
  }
})
