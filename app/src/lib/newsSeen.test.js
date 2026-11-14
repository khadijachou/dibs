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
const v12 = NEWS.find((n) => n.v === '1.2') // the newest big entry (v1.2.0)

test('1.2, 1.1.9 and 1.1.0 are the big ones, each with a summary', () => {
  assert.deepEqual(NEWS.filter((n) => n.big).map((n) => n.v), ['1.2', '1.1.9', '1.1'])
  assert.equal(v110.sum, 'news_sum_13')
  assert.equal(v119.sum, 'news_sum_22')
  assert.equal(v12.sum, 'news_sum_27')
})

test('nothing saved and onboarded gives the newest big entry (1.2)', () => {
  assert.equal(unreadNews({ storage: onboarded() }), v12)
})

test('nothing saved and not onboarded gives null', () => {
  assert.equal(unreadNews({ storage: store() }), null)
})

test('saved 1.2 gives null; saved 1.1.0 to 1.1.13 gives the 1.2 entry', () => {
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.2' }) }), null)
  for (const v of ['1.1', '1.1.0', '1.1.1', '1.1.8', '1.1.9', '1.1.13']) assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: v }) }), v12, v)
})

test('saved 1.0.10 gives the newest big entry, 1.2 (by place in the list, not string order)', () => {
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.0.10' }) }), v12)
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.0.9' }) }), v12)
})

test('a newer release that is not big gives null', () => {
  const list = [{ date: '2026-12-01', key: 'news_99', v: '1.3' }, ...NEWS]
  assert.equal(unreadNews({ list, storage: onboarded({ [NEWS_SEEN_KEY]: '1.2' }) }), null)
})

test('a saved value that is not in the list counts as nothing saved', () => {
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '9.9.9' }) }), v12)
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

test('v1.2 is big: someone who saw 1.1.13 (or 1.1.9, or 1.1.8) gets the dot, with its summary', () => {
  assert.equal(NEWS[0].v, '1.2')
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.13' }) }), v12)
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.9' }) }), v12)
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.8' }) }), v12)
  assert.equal(unreadNews({ storage: onboarded({ [NEWS_SEEN_KEY]: '1.1.13' }) }).sum, 'news_sum_27')
})

test('the releases between the big ones are not big: 1.1.10 to 1.1.13', () => {
  for (const v of ['1.1.10', '1.1.11', '1.1.12', '1.1.13']) assert.ok(!NEWS.find((n) => n.v === v).big, v)
})