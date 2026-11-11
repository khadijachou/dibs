import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Map-backed localStorage stand-in (defaultRegion and goals read it).
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const { catalogBrands, defaultRegion, rememberRegion, worksLine } = await import('./brands.js')
const { goalVersion } = await import('./version.js')
const { cardChangePatch } = await import('./availability.js')
const { detailText, itemLabel } = await import('./itemName.js')
const { makeT } = await import('./i18n.js')

const NBSP = String.fromCharCode(0xa0)
const plain = (s) => s.replace(/[  ]/g, ' ')
const W = (en) => ({ en, fr: `fr ${en}`, es: `es ${en}` })
const item = (slug, value, region, currency, worksWith, usd = Number(value)) => ({
  id: `${slug}-${value}`, name: 'Netflix', detail: `${value} ${currency}`, faceValue: value, usd, live: true, sold: true, inStock: true,
  region, currency, worksWith, shopUrl: `https://www.bitrefill.com/${slug}/`,
})
const CATALOG = [
  item('netflix-eu', '50', 'Europe', 'EUR', W('For Netflix accounts in Europe'), 55.58),
  item('netflix-usa', '60', 'USA', 'USD', W('For Netflix accounts in the USA')),
  item('netflix-eu', '25', 'Europe', 'EUR', W('For Netflix accounts in Europe'), 27.79),
  item('netflix-usa', '30', 'USA', 'USD', W('For Netflix accounts in the USA')),
  item('netflix-united-kingdom', '50', 'UK', 'GBP', W('For Netflix accounts in the UK'), 66.49),
  { ...item('steam-usa', '20', 'USA', 'USD', W('For Steam accounts with a USD wallet'), 22.46), name: 'Steam gift card' },
  { ...item('fortnite-uk-united-kingdom', '10', 'UK', 'GBP', W('For Epic Games accounts in the UK'), 13.67), name: 'Fortnite gift card' },
]
const brand = (key) => catalogBrands(CATALOG).find((b) => b.key === key)

beforeEach(() => store.clear())

test('catalogBrands: Netflix has its versions apart, in order USA, Europe, UK; one-version brands have one', () => {
  const nf = brand('netflix')
  assert.deepEqual(nf.regions.map((r) => r.key), ['USA', 'Europe', 'UK'])
  assert.deepEqual(nf.regions[0].items.map((i) => i.id), ['netflix-usa-30', 'netflix-usa-60'])
  assert.deepEqual(nf.regions[1].items.map((i) => i.id), ['netflix-eu-25', 'netflix-eu-50'])
  assert.equal(nf.regions[1].currency, 'EUR')
  assert.equal(brand('steam').regions.length, 1)
  for (const b of catalogBrands(CATALOG)) {
    for (const r of b.regions) for (const l of ['en', 'fr', 'es']) assert.ok(r.worksWith?.[l], `${b.key} ${r.key} ${l}`)
  }
})

test('catalogBrands: brand.items is the default version, never USA and Europe mixed', () => {
  const nf = brand('netflix')
  assert.deepEqual(nf.items, nf.regions.find((r) => r.key === nf.defaultRegion).items)
  assert.ok(nf.items.every((i) => i.region === 'USA'))
  rememberRegion('netflix', 'Europe')
  const again = brand('netflix')
  assert.equal(again.defaultRegion, 'Europe')
  assert.ok(again.items.every((i) => i.region === 'Europe'))
})

test('default version: the last pick wins, else USA, else the first; a EUR host fiat or language changes nothing', () => {
  // Anything the app might know about the user's money or language: none of it is read.
  store.set('dibs.fiat', 'EUR')
  store.set('dibs.lang', 'fr')
  assert.equal(defaultRegion(brand('netflix')).key, 'USA')
  store.set('dibs.region.netflix', 'UK')
  assert.equal(defaultRegion(brand('netflix')).key, 'UK')
  store.set('dibs.region.netflix', 'Nigeria') // not sold for this brand: ignored
  assert.equal(defaultRegion(brand('netflix')).key, 'USA')
  assert.equal(defaultRegion(brand('fortnite')).key, 'UK', 'no USA version: the brand\'s first')
})

test('an old goal (steam-20, no region) still resolves its item, USA and the Steam USA line', () => {
  const goal = { id: 'g', itemId: 'steam-20', itemName: 'Steam gift card', itemDetail: '20 USD', usd: 22.48, status: 'saving', deposits: [] }
  const v = goalVersion(goal) // the catalogue is not loaded here: the fallback list (lib/catalog.js) answers
  assert.equal(v.region, 'USA')
  assert.equal(v.currency, 'USD')
  assert.equal(v.worksWith.en, 'For Steam accounts with a USD wallet')
  assert.ok(v.worksWith.fr && v.worksWith.es)
  assert.equal(plain(itemLabel(makeT('en'), goal)), 'Steam gift card · 20 USD')
  assert.equal(worksLine(makeT('en'), v.worksWith), 'For Steam accounts with a USD wallet. Check your account before you call dibs.')
  // An old Netflix Europe goal that the catalogue no longer lists still reads Europe from its EUR value.
  assert.equal(goalVersion({ itemId: 'gone', itemDetail: '25 EUR' }).region, 'Europe')
})

test('cardChangePatch on a ready goal: deposits and status kept, new item and version set, old card kept', () => {
  const goal = { id: 'g', itemId: 'valorant-usa-24-99', itemName: 'Valorant gift card', itemDetail: '24.99 USD', usd: 24.99, targetNim: 90000,
    status: 'ready', region: 'USA', currency: 'USD', worksWith: W('For Riot accounts in the USA'), deposits: [{ nim: 90000 }], unlockSteps: [{ step: 'remove' }] }
  const eu = { id: 'valorant-eu-20', name: 'Valorant gift card', detail: '20 EUR', usd: 22.23, faceValue: '20', region: 'Europe', currency: 'EUR', worksWith: W('For Riot accounts in Europe') }
  const patch = cardChangePatch(goal, { item: eu, targetNim: 80000, brand: { key: 'valorant', name: 'Valorant' }, nimUsd: 0.00025 })
  const next = { ...goal, ...patch }
  assert.deepEqual(next.deposits, goal.deposits)
  assert.equal(next.status, 'ready')
  assert.deepEqual(next.unlockSteps, goal.unlockSteps)
  assert.equal(next.itemId, 'valorant-eu-20')
  assert.equal(next.region, 'Europe')
  assert.equal(next.currency, 'EUR')
  assert.deepEqual(next.worksWith, eu.worksWith)
  assert.equal(next.targetNim, 80000)
  assert.equal(next.cardChanges.at(-1).itemId, 'valorant-usa-24-99')
  assert.equal(next.cardChanges.at(-1).region, 'USA')
  for (const k of ['deposits', 'status', 'unlockSteps', 'id']) assert.ok(!(k in patch), k)
})

test('detailText: "<value> <currency>" in the user\'s language, thousands separated', () => {
  assert.equal(plain(detailText(makeT('en'), { detail: '20 EUR' })), '20 EUR')
  assert.equal(plain(detailText(makeT('fr'), { detail: '9.99 USD' })), '9,99 USD')
  assert.equal(plain(detailText(makeT('es'), { detail: '9.99 USD' })), '9,99 USD')
  assert.equal(plain(detailText(makeT('en'), { detail: '5000 NGN' })), '5,000 NGN')
  assert.equal(plain(detailText(makeT('fr'), { detail: '5000 NGN' })), '5 000 NGN')
  assert.ok(detailText(makeT('en'), { detail: '20 EUR' }).includes(`20${NBSP}EUR`), 'number and currency never split')
})
