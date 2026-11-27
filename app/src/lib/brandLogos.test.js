// v1.1.7: Steam, Best Buy, Apple, Uber and Fortnite draw their official logo files, contained on the white plate (no
// logoPlate 'fill', no simple-icons glyph, no dark tile). Flightgift keeps its square icon filling the tile (the wide
// wordmark was unreadable at chip size). Uber Eats keeps its simple-icons glyph.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { BRANDS } from './brands.js'
import { BRAND_ICONS, DARK_TILES } from './brandIcons.js'

const FILES = {
  steam: '/logos/steam.png',
  bestbuy: '/logos/Best-Buy.png',
  apple: '/logos/apple.png',
  uber: '/logos/uber.png',
  fortnite: '/logos/fortnite.png',
}
const pub = (p) => new URL(`../../public${p}`, import.meta.url)

test('the five brands point to their logo file, which exists in app/public/logos, with no logoPlate fill', () => {
  for (const [key, file] of Object.entries(FILES)) {
    const b = BRANDS.find((x) => x.key === key)
    assert.ok(b, key)
    assert.equal(b.logo, file, key)
    assert.ok(existsSync(pub(file)), `${file} exists`)
    assert.notEqual(b.logoPlate, 'fill', `${key} has no logoPlate fill`)
  }
})

test('Flightgift keeps its square icon, filling the tile', () => {
  const b = BRANDS.find((x) => x.key === 'flightgift')
  assert.equal(b.logo, '/logos/flightgift.jpg')
  assert.equal(b.logoPlate, 'fill')
  assert.ok(existsSync(pub(b.logo)))
  assert.equal(BRAND_ICONS.flightgift, undefined)
})

test('the six brands have no simple-icons glyph and no dark tile, so BrandLogo draws the file; Uber Eats keeps its glyph', () => {
  for (const key of [...Object.keys(FILES), 'flightgift']) {
    assert.equal(BRAND_ICONS[key], undefined, key)
    assert.equal(DARK_TILES[key], undefined, key)
  }
  assert.ok(BRAND_ICONS.ubereats)
})

// v1.8.1 AI & Tools logos: five coloured marks on the default white plate, and NordPass (a white mountain on its own
// teal square) on a teal plate the picture blends into. Surfshark keeps its simple-icons glyph (no logo file). Every
// tile stays as the fallback; the letter is unchanged.
const AI_TOOLS = {
  chatgpt: { file: '/logos/chatgpt.png', letter: 'C' },
  ppq: { file: '/logos/ppq.png', letter: 'P' },
  nordpass: { file: '/logos/nordpass.png', letter: 'N', plate: '#00cfb6' },
  exitlag: { file: '/logos/exitlag.png', letter: 'E' },
  gworkspace: { file: '/logos/gworkspace.png', letter: 'G' },
  msoffice: { file: '/logos/msoffice.png', letter: 'M' },
}

test('the AI & Tools logos point to their file, keep their letter tile, and only NordPass gets a coloured plate', () => {
  for (const [key, spec] of Object.entries(AI_TOOLS)) {
    const b = BRANDS.find((x) => x.key === key)
    assert.ok(b, key)
    assert.equal(b.logo, spec.file, key)
    assert.ok(existsSync(pub(spec.file)), `${spec.file} exists`)
    assert.equal(b.logoPlate, spec.plate, `${key} plate`) // undefined = default white plate, except NordPass teal
    assert.notEqual(b.logoPlate, 'fill', `${key} is not a fill plate`)
    assert.equal(b.tile.letter, spec.letter, `${key} tile letter unchanged`)
    assert.equal(BRAND_ICONS[key], undefined, `${key} has no simple-icons glyph`)
  }
})

test('Surfshark keeps its simple-icons glyph and no logo file', () => {
  const b = BRANDS.find((x) => x.key === 'surfshark')
  assert.equal(b.logo, null)
  assert.ok(BRAND_ICONS.surfshark)
})
