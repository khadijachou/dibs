import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
const { applyTheme, getTheme, getThemeChoice, resolveTheme, setTheme, THEME_COLOR, THEMES } = await import('./theme.js')

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

// v1.3.1: the stored choice can also be 'auto', which follows the phone's prefers-color-scheme.
test('THEMES are dark, light and auto', () => {
  assert.deepEqual(THEMES, ['dark', 'light', 'auto'])
})

test('resolveTheme: auto follows the phone, light is light, anything else is dark', () => {
  assert.equal(resolveTheme('auto', true), 'dark') // phone on dark
  assert.equal(resolveTheme('auto', false), 'light') // phone on light
  assert.equal(resolveTheme('dark', true), 'dark')
  assert.equal(resolveTheme('light', false), 'light')
  assert.equal(resolveTheme('blue', true), 'dark') // bad input is dark
  assert.equal(resolveTheme(undefined, false), 'dark')
})

test('a missing choice reads as dark', () => {
  assert.equal(getThemeChoice(), 'dark')
  store.set('dibs.theme', 'auto')
  assert.equal(getThemeChoice(), 'auto')
})

test("setTheme('auto') stores 'auto'", () => {
  const doc = fakeDoc()
  setTheme('auto', doc)
  assert.equal(store.get('dibs.theme'), 'auto')
  assert.equal(getThemeChoice(), 'auto')
})

test("applyTheme never sets data-theme to 'auto'", () => {
  const doc = fakeDoc()
  assert.equal(applyTheme('auto', doc), 'dark')
  assert.equal(doc.documentElement.dataset.theme, 'dark')
  assert.notEqual(doc.documentElement.dataset.theme, 'auto')
})
