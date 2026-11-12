import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
const { applyTheme, getTheme, setTheme, THEME_COLOR } = await import('./theme.js')

// A tiny document: <html data-theme> and <meta name="theme-color">.
const fakeDoc = () => {
  const meta = { content: THEME_COLOR.dark, setAttribute(k, v) { this[k] = v } }
  return { documentElement: { dataset: {} }, querySelector: (q) => (q.includes('theme-color') ? meta : null), meta }
}

beforeEach(() => store.clear())

test('a fresh install (no dibs.theme) is dark; anything but "light" is dark', () => {
  assert.equal(getTheme(), 'dark')
  store.set('dibs.theme', 'blue')
  assert.equal(getTheme(), 'dark')
  store.set('dibs.theme', 'light')
  assert.equal(getTheme(), 'light')
})

test('setTheme saves the choice and applies it at once (data-theme and theme-color)', () => {
  const doc = fakeDoc()
  setTheme('light', doc)
  assert.equal(store.get('dibs.theme'), 'light')
  assert.equal(doc.documentElement.dataset.theme, 'light')
  assert.equal(doc.meta.content, '#fbf6ef')
  assert.equal(getTheme(), 'light', 'kept after a reload')
  setTheme('dark', doc)
  assert.deepEqual([store.get('dibs.theme'), doc.documentElement.dataset.theme, doc.meta.content], ['dark', 'dark', '#E8482A'])
})

test('applyTheme without a document does nothing and never throws', () => {
  assert.equal(applyTheme('light', null), 'light')
})
