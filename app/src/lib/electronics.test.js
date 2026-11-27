// v1.6.0 part 1: the Electronics category (hidden behind the server's pending flag until tested).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
beforeEach(() => store.clear())

const { BRANDS, CHIPS, CLASSIC_CHIPS, REGION_ORDER, SINGLE_COUNTRY, catalogBrands, questChips, shownChips } = await import('./brands.js')
const { DICTS } = await import('./i18n.js')
const { evaluate } = await import('./badges.js')
const { catalogPreview } = await import('./catalog.js')

const SIX = {
  currys: { slug: 'currys-pc-world-uk', region: 'UK', delivers: 'pin' },
  mediamarkt: { slug: 'media-markt-germany', region: 'Germany', delivers: 'pin' },
  fnacdarty: { slug: 'fnac-darty-france', region: 'France', delivers: 'pin' },
  electrodepot: { slug: 'electro-depot-france', region: 'France', delivers: 'code' },
  slot: { slug: 'slot-nigeria', region: 'Nigeria', delivers: 'instore', store: 'SLOT' },
  samsung: { slug: 'samsung-nigeria', region: 'Nigeria', delivers: 'instore', store: 'Samsung MGS' },
}

test('chips: Electronics first; the Full set badge keeps the five older categories', () => {
  assert.deepEqual(CHIPS, ['electronics', 'tools', 'games', 'travel', 'shopping', 'streaming', 'food'])
  assert.deepEqual(CLASSIC_CHIPS, ['games', 'travel', 'shopping', 'streaming', 'food'])
  const r = (brandKey) => ({ id: brandKey, brandKey, status: 'redeemed', targetNim: 1000, deposits: [], unlockSteps: [], createdAt: '2026-11-01T00:00:00Z', deadline: '2027-01-01T00:00:00Z' })
  const has = (goals, id) => evaluate({ goals, now: Date.parse('2026-12-02T00:00:00Z') }).some((x) => x.id === id)
  assert.ok(has(['steam', 'airbnb', 'netflix', 'ubereats', 'amazon'].map(r), 'fullset'), 'no Electronics card needed')
})

test('quests only ask for a category with a visible brand', () => {
  const b = (key, chip) => ({ key, chip })
  // All six Electronics brands pending: no Electronics brand in the live catalogue, so the chip is skipped.
  assert.deepEqual(shownChips([b('steam', 'games'), b('amazon', 'shopping')], true), ['games', 'shopping'])
  assert.deepEqual(shownChips([b('mediamarkt', 'electronics'), b('steam', 'games')], true), ['electronics', 'games'])
  // Catalogue not loaded (fallback list): the five older categories, as before v1.6.0.
  assert.deepEqual(shownChips([], false), CLASSIC_CHIPS)
  assert.deepEqual(questChips(), CLASSIC_CHIPS)
})

test('six Electronics brands below Best Buy, with their slugs, version, delivery and lead', () => {
  const keys = BRANDS.map((x) => x.key)
  const at = keys.indexOf('bestbuy')
  assert.deepEqual(keys.slice(at + 1, at + 7), Object.keys(SIX))
  assert.equal(BRANDS.find((x) => x.key === 'bestbuy').chip, 'electronics', 'Best Buy moved to Electronics in part 2')
  for (const [key, want] of Object.entries(SIX)) {
    const b = BRANDS.find((x) => x.key === key)
    assert.equal(b.chip, 'electronics', key)
    assert.deepEqual(b.slugs, [want.slug], key)
    assert.deepEqual(b.region, [want.region], key)
    assert.equal(b.delivers, want.delivers, key)
    assert.equal(b.about, `brand_about_${key}`, key)
    assert.equal(b.store, want.store, key)
    assert.ok(Array.isArray(b.color) && b.color.every((c) => /^#[0-9a-f]{6}$/i.test(c)), `${key} color`)
    assert.ok(/^#[0-9a-f]{6}$/i.test(b.tile?.bg || ''), `${key} tile`)
  }
  assert.equal(BRANDS.find((x) => x.key === 'samsung').tile.bg.toUpperCase(), '#1428A0')
})

test('Germany and France versions: after Europe, EUR, single-country', () => {
  assert.deepEqual(REGION_ORDER, ['USA', 'Europe', 'Germany', 'France', 'UK', 'Nigeria'])
  assert.deepEqual(SINGLE_COUNTRY, ['Germany', 'France'])
  const item = (id, slug, region, currency) => ({ id, name: 'X gift card', faceValue: '10', usd: 11, currency, region, inStock: true, live: true, shopUrl: `https://www.bitrefill.com/${slug}/` })
  const brands = catalogBrands([item('mm-10', 'media-markt-germany', 'Germany', 'EUR'), item('fd-20', 'fnac-darty-france', 'France', 'EUR')])
  const mm = brands.find((x) => x.key === 'mediamarkt')
  assert.equal(mm.defaultRegion, 'Germany', 'a Germany-only brand opens on its only version')
  assert.equal(mm.regions[0].currency, 'EUR')
  assert.equal(brands.find((x) => x.key === 'fnacdarty').defaultRegion, 'France')
})

test('pending preview: only with dibs.catalogPreview = "1"', () => {
  assert.equal(catalogPreview(), false)
  localStorage.setItem('dibs.catalogPreview', '1')
  assert.equal(catalogPreview(), true)
  localStorage.setItem('dibs.catalogPreview', 'true')
  assert.equal(catalogPreview(), false)
})

const NEW_KEYS = ['chip_electronics', 'chip_new', 'delivers_instore', 'dlv_short_instore', 'region_Germany', 'region_France', 'region_only',
  'region_not_eu', 'instore_only', 'instore_how', ...Object.keys(SIX).map((k) => `brand_about_${k}`)]

test('new strings: en, fr and es, same placeholders, no em dash, no "!"', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',')
  for (const k of NEW_KEYS) {
    for (const lang of ['en', 'fr', 'es']) {
      const v = DICTS[lang][k]
      assert.ok(typeof v === 'string' && v.trim(), `${lang} ${k}`)
      assert.ok(!/[—!]/.test(v), `${lang} ${k}: ${v}`)
      assert.equal(ph(v), ph(DICTS.en[k]), `${lang} ${k} placeholders`)
    }
  }
  assert.equal(DICTS.en.chip_electronics, 'Electronics')
  assert.equal(DICTS.fr.chip_electronics, 'Électronique')
  assert.equal(DICTS.es.chip_electronics, 'Electrónica')
  assert.equal(DICTS.es.region_only, 'Solo {region}')
})
