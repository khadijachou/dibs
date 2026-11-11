import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Map-backed localStorage stand-in. Object.keys(localStorage) must list the stored keys, as in a browser.
const store = new Map()
const ls = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.localStorage = new Proxy(ls, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined),
})

const { _resetPrefsForTest, getPref, migratePrefs, prefCount, prunePrefs, readPrefs, removePref, setPref } = await import('./prefs.js')
const { brandRegion, catalogBrands, defaultRegion, filterBrands, prefBrands } = await import('./brands.js')
const { createGoal } = await import('./goals.js')
const { cardChangePatch } = await import('./availability.js')

const item = (slug, value, region, currency) => ({
  id: `${slug}-${value}`, name: 'X gift card', detail: `${value} ${currency}`, faceValue: value, usd: Number(value), live: true, sold: true, inStock: true,
  region, currency, worksWith: { en: `For ${region}` }, shopUrl: `https://www.bitrefill.com/${slug}/`,
})
const CATALOG = [
  item('netflix-usa', '30', 'USA', 'USD'), item('netflix-eu', '25', 'Europe', 'EUR'), item('netflix-united-kingdom', '50', 'UK', 'GBP'),
  item('steam-usa', '20', 'USA', 'USD'), item('steam-eur-international', '20', 'Europe', 'EUR'),
  item('amazon_com-usa', '25', 'USA', 'USD'), item('amazon-uk', '25', 'UK', 'GBP'),
  item('uber-eats-usa', '25', 'USA', 'USD'), item('fortnite-uk-united-kingdom', '10', 'UK', 'GBP'),
]
const brands = () => catalogBrands(CATALOG)
const brand = (key) => brands().find((b) => b.key === key)

beforeEach(() => { store.clear(); _resetPrefsForTest() })

test('migration: dibs.region.* keys move into dibs.prefs and are deleted; a pref already saved wins', () => {
  store.set('dibs.region.netflix', 'Europe')
  store.set('dibs.region.steam', 'Europe')
  store.set('dibs.prefs', JSON.stringify({ steam: 'USA' }))
  migratePrefs()
  assert.deepEqual(readPrefs(), { steam: 'USA', netflix: 'Europe' })
  assert.equal(store.has('dibs.region.netflix'), false)
  assert.equal(store.has('dibs.region.steam'), false)
})

test('migration runs on the first read', () => {
  store.set('dibs.region.amazon', 'UK')
  assert.equal(getPref('amazon'), 'UK')
  assert.equal(store.has('dibs.region.amazon'), false)
})

test('default version: saved pref, else USA, else the brand\'s first version', () => {
  assert.equal(defaultRegion(brand('netflix')).key, 'USA')
  setPref('netflix', 'UK')
  assert.equal(defaultRegion(brand('netflix')).key, 'UK')
  setPref('netflix', 'Nigeria') // not sold for this brand
  assert.equal(defaultRegion(brand('netflix')).key, 'USA')
  assert.equal(defaultRegion(brand('fortnite')).key, 'UK')
})

test('tapping a chip (brandRegion with a key) shows that version and saves nothing', () => {
  assert.equal(brandRegion(brand('netflix'), 'Europe').key, 'Europe')
  assert.equal(store.has('dibs.prefs'), false)
  assert.deepEqual(readPrefs(), {})
})

test('createGoal saves the goal\'s version for its brand; the last one used wins', () => {
  createGoal('NQ1', { item: CATALOG[1], targetNim: 1000, deadline: '2026-12-01', brand: brand('netflix') })
  assert.equal(getPref('netflix'), 'Europe')
  createGoal('NQ1', { item: CATALOG[2], targetNim: 1000, deadline: '2026-12-01', brand: brand('netflix') })
  assert.equal(getPref('netflix'), 'UK')
  createGoal('NQ1', { item: CATALOG[0], targetNim: 1000, deadline: '2026-12-01', brand: null })
  assert.equal(prefCount(), 1, 'no brand: nothing saved')
})

test('cardChangePatch saves the new card\'s version', () => {
  const g = { id: 'g', itemId: 'steam-usa-20', itemName: 'Steam gift card', itemDetail: '20 USD', region: 'USA', deposits: [] }
  cardChangePatch(g, { item: CATALOG[4], targetNim: 1000, brand: brand('steam'), nimUsd: 0.0002 })
  assert.equal(getPref('steam'), 'Europe')
})

test('removePref removes one brand only', () => {
  setPref('netflix', 'UK')
  setPref('steam', 'Europe')
  removePref('netflix')
  assert.deepEqual(readPrefs(), { steam: 'Europe' })
  removePref('nothing')
  assert.equal(prefCount(), 1)
})

test('Add a preference: only brands with 2+ versions, with their versions and the saved tag', () => {
  setPref('amazon', 'UK')
  setPref('uber', 'USA') // a pref for a brand not in the list does not show
  const rows = prefBrands(brands(), readPrefs())
  assert.deepEqual(rows.map((r) => r.brand.key), ['steam', 'amazon', 'netflix'])
  assert.deepEqual(rows.find((r) => r.brand.key === 'netflix').versions, ['USA', 'Europe', 'UK'])
  assert.equal(rows.find((r) => r.brand.key === 'amazon').saved, 'UK')
  assert.equal(rows.find((r) => r.brand.key === 'steam').saved, null)
})

test('Add a preference: search and category filter over that list', () => {
  const list = prefBrands(brands(), {}).map((r) => r.brand)
  assert.deepEqual(filterBrands(list, { q: 'net' }).map((b) => b.key), ['netflix'])
  assert.deepEqual(filterBrands(list, { q: 'ST' }).map((b) => b.key), ['steam'])
  assert.deepEqual(filterBrands(list, { chip: 'games' }).map((b) => b.key), ['steam'])
  assert.deepEqual(filterBrands(list, { chip: 'shopping', q: 'am' }).map((b) => b.key), ['amazon'])
  assert.deepEqual(filterBrands(list, { q: 'zzz' }), [])
})

test('the static brand list has 16 brands with more than one version', async () => {
  const { BRANDS } = await import('./brands.js')
  assert.equal(BRANDS.filter((b) => b.region.length > 1).length, 16)
})

test('a brand sold in one version is never saved, on createGoal or on Change card', () => {
  createGoal('NQ1', { item: CATALOG[7], targetNim: 1000, deadline: '2026-12-01', brand: brand('ubereats') })
  const g = { id: 'g', itemId: 'x', itemName: 'X', itemDetail: '10 GBP', region: 'UK', deposits: [] }
  cardChangePatch(g, { item: CATALOG[8], targetNim: 1000, brand: brand('fortnite'), nimUsd: 0.0002 })
  cardChangePatch(g, { item: CATALOG[0], targetNim: 1000, brand: { key: 'netflix', name: 'Netflix' }, nimUsd: 0.0002 }) // no catalogue versions known
  assert.deepEqual(readPrefs(), {})
})

test('first run: saved entries for single-version brands are dropped, once; unknown brands are kept', () => {
  store.set('dibs.prefs', JSON.stringify({ ubereats: 'USA', fortnite: 'UK', netflix: 'Europe', gone: 'USA' }))
  prunePrefs(brands())
  assert.deepEqual(readPrefs(), { netflix: 'Europe', gone: 'USA' })
  assert.equal(store.get('dibs.prefs.pruned'), '1')
  setPref('ubereats', 'USA') // after the first run, nothing is pruned again
  prunePrefs(brands())
  assert.equal(getPref('ubereats'), 'USA')
})
