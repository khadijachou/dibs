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
const v119 = NEWS.find((n) => n.v === '1.1.9')

test('the 1.1.9 and 1.1.0 entries are the only big ones, each with a summary', () => {
  assert.deepEqual(NEWS.filter((n) => n.big).map((n) => n.v), ['1.1.9', '1.1'])
  assert.equal(v110.sum, 'news_sum_13')
  assert.equal(v119.sum, 'news_sum_22')
})

test('nothing saved and onboarded gives the newest big entry (1.1.9)', () => {
  assert.equal(unreadNews({ storage: onboarded() }), v119)
})

test('nothing saved and not onboarded gives null', () => {
  assert.equal(unreadNews({ storage: store() }), null)
})

test('saved 1.1.9 gives null; saved 1.1.0 to 1.1.8 gives the 1.1.9 entry', () => {
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.9' }) }), null)
  for (const v of ['1.1', '1.1.0', '1.1.1', '1.1.8']) assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: v }) }), v119, v)
})

test('saved 1.0.10 gives the newest big entry, 1.1.9 (by place in the list, not string order)', () => {
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.0.10' }) }), v119)
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.0.9' }) }), v119)
})

test('a newer release that is not big gives null', () => {
  const list = [{ date: '2026-12-01', key: 'news_99', v: '1.2' }, ...NEWS]
  assert.equal(unreadNews({ list, storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.9' }) }), null)
})

test('a saved value that is not in the list counts as nothing saved', () => {
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '9.9.9' }) }), v119)
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

test('v1.1.9 is big: someone who saw 1.1.8 (or 1.1.7) gets the dot, with its summary', () => {
  assert.equal(NEWS[1].v, '1.1.9')
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.8' }) }), v119)
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.7' }) }), v119)
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.8' }) }).sum, 'news_sum_22')
})

test('v1.1.10 is not big: someone who saw 1.1.9 gets no dot; someone who saw only 1.1.8 still gets the 1.1.9 one', () => {
  assert.equal(NEWS[0].v, '1.1.10')
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.9' }) }), null)
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.8' }) }), v119)
})
