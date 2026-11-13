import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NEWS } from './news.js'
import { NEWS_SEEN_KEY, markNewsSeen, unreadNews } from './newsSeen.js'

const store = (init = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }
}
const onboarded = (extra = {}) => store({ 'dibs.onboarded': '1', ...extra })
const v110 = NEWS.find((n) => n.v === '1.1')

test('the 1.1.0 entry is the only big one, with a summary', () => {
  assert.deepEqual(NEWS.filter((n) => n.big).map((n) => n.v), ['1.1'])
  assert.equal(v110.sum, 'news_sum_13')
})

test('nothing saved and onboarded gives the 1.1.0 entry', () => {
  assert.equal(unreadNews({ storage: onboarded() }), v110)
})

test('nothing saved and not onboarded gives null', () => {
  assert.equal(unreadNews({ storage: store() }), null)
})

test('saved 1.1.0 or newer gives null', () => {
  for (const v of ['1.1', '1.1.0', '1.1.1']) assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: v }) }), null, v)
})

test('saved 1.0.10 gives the 1.1.0 entry (by place in the list, not string order)', () => {
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.0.10' }) }), v110)
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.0.9' }) }), v110)
})

test('a newer release that is not big gives null', () => {
  const list = [{ date: '2026-12-01', key: 'news_99', v: '1.2' }, ...NEWS]
  assert.equal(unreadNews({ list, storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.1' }) }), null)
})

test('a saved value that is not in the list counts as nothing saved', () => {
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '9.9.9' }) }), v110)
  assert.equal(unreadNews({ storage: store({ [NEWS_SEEN_KEY]: 'junk' }) }), null)
})

test('storage that throws gives null, and markNewsSeen does not throw', () => {
  const bad = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.equal(unreadNews({ storage: bad }), null)
  assert.equal(unreadNews({ storage: null }), null)
  assert.doesNotThrow(() => markNewsSeen({ storage: bad }))
})

test('markNewsSeen saves the newest version, then nothing is unread', () => {
  const s = onboarded()
  markNewsSeen({ storage: s })
  assert.equal(s.map.get(NEWS_SEEN_KEY), NEWS[0].v)
  assert.equal(unreadNews({ storage: s }), null)
})
