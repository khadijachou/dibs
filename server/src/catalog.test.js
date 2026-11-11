import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAX_USD, MAX_VALUES, REGIONS, detailOf, itemId, keptPackages, regionOf, validWorksWith } from './catalogRules.js'

const items = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'))

// The ids sold before card versions (v1.0.0). Goals point at them: they must never change.
const OLD_IDS = 'steam-50,steam-20,steam-5,amazon_com-usa-10,amazon_com-usa-20,amazon_com-usa-50,netflix-usa-60,apple-usa-10,apple-usa-25,apple-usa-50,sony-playstation-usa-50,sony-playstation-usa-100,netflix-eu-25,netflix-eu-50,uber-eats-usa-50,uber-eats-usa-20,airbnb-usa-50,airbnb-usa-100,airbnb-usa-200,google-play-usa-5,google-play-usa-10,google-play-usa-20,nintendo-eshop-usa-10,nintendo-eshop-usa-20,nintendo-eshop-usa-50,roblox-usa-10,roblox-usa-20,roblox-usa-50,valorant-usa-9-99,valorant-usa-24-99,valorant-usa-49-99,riot-access-usa-9-99,riot-access-usa-24-99,riot-access-usa-49-99,xbox-usa-10,xbox-usa-25,xbox-usa-50,discord-nitro-usa-1-year,flightgift-usa-50,flightgift-usa-100,flightgift-usa-200,starbucks-usa-10,starbucks-usa-50,best-buy-usa-50,best-buy-usa-100,hotels_com-usa-50,hotels_com-usa-100,hotels_com-usa-200,uber-usa-50,uber-usa-100,disney-usa-50,disney-usa-100,doordash-usa-50,doordash-usa-100'.split(',')
const CURRENCY = { USA: 'USD', Europe: 'EUR', UK: 'GBP', Nigeria: 'NGN' }

test('every item has a version, its currency and a works-with line in en, fr and es', () => {
  for (const i of items) {
    assert.ok(REGIONS.includes(i.region), `${i.id} region ${i.region}`)
    assert.equal(i.currency, CURRENCY[i.region], i.id)
    assert.ok(validWorksWith(i.worksWith), `${i.id} worksWith`)
    if (/^\d+(\.\d+)?$/.test(i.packageValue)) assert.equal(i.detail, `${i.packageValue} ${i.currency}`, i.id)
  }
})

test('ids are unique and every old id is still there', () => {
  const ids = items.map((i) => i.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of OLD_IDS) assert.ok(ids.includes(id), id)
})

test('every new item cost 100 USD or less when added; at most 8 new-rule values per product', () => {
  const fresh = items.filter((i) => !OLD_IDS.includes(i.id))
  for (const i of fresh) assert.ok(i.fallbackUsd <= MAX_USD, `${i.id} ${i.fallbackUsd}`)
  const perSlug = {}
  for (const i of items) if (i.fallbackUsd <= MAX_USD) perSlug[i.slug] = (perSlug[i.slug] || 0) + 1
  // Old items stay even above the cap (Riot Access keeps 24.99, a value the shop no longer sells).
  for (const [slug, n] of Object.entries(perSlug)) assert.ok(n <= MAX_VALUES + 1, `${slug} ${n}`)
})

test('items of the same product share one version and one works-with line', () => {
  const by = {}
  for (const i of items) (by[i.slug] ??= []).push(i)
  for (const [slug, list] of Object.entries(by)) {
    assert.equal(new Set(list.map((i) => i.region)).size, 1, slug)
    assert.equal(new Set(list.map((i) => JSON.stringify(i.worksWith))).size, 1, slug)
  }
})

test('versions come from the shop country and currency only', () => {
  assert.deepEqual(regionOf({ country: 'US', currency: 'USD' }), { region: 'USA', currency: 'USD' })
  assert.deepEqual(regionOf({ country: 'XI', currency: 'USD' }), { region: 'USA', currency: 'USD' })
  assert.deepEqual(regionOf({ country: 'EU', currency: 'EUR' }), { region: 'Europe', currency: 'EUR' })
  assert.deepEqual(regionOf({ country: 'GB', currency: 'GBP' }), { region: 'UK', currency: 'GBP' })
  assert.deepEqual(regionOf({ country: 'NG', currency: 'NGN' }), { region: 'Nigeria', currency: 'NGN' })
  assert.equal(regionOf({ country: 'FR', currency: 'EUR' }), null, 'per-country cards (Amazon.fr) are not Europe')
  assert.equal(regionOf({ country: 'CA', currency: 'CAD' }), null)
})

test('values kept: paid in USD, 100 USD or less, 8 at most, largest dropped first', () => {
  const pk = (value, price, priceCurrency = 'USD') => ({ value, price, priceCurrency })
  const kept = keptPackages([pk('100', 100), pk('5', 5), pk('150', 150), pk('10', 10), pk('20', 20), pk('25', 25), pk('30', 30), pk('40', 40), pk('50', 50), pk('60', 60), pk('7', 7, 'EUR')])
  assert.deepEqual(kept.map((k) => k.value), ['5', '10', '20', '25', '30', '40', '50', '60'])
  assert.equal(itemId('valorant-usa', '9.99'), 'valorant-usa-9-99')
  assert.equal(detailOf('20', 'EUR'), '20 EUR')
  assert.equal(detailOf('1 Month', 'USD'), '1 Month')
})

test('one item per value per version: no two items share slug + packageValue', () => {
  const seen = new Map()
  for (const i of items) {
    const k = `${i.slug}|${i.packageValue}`
    assert.ok(!seen.has(k), `${i.id} repeats ${seen.get(k)} (${k})`)
    seen.set(k, i.id)
  }
})
