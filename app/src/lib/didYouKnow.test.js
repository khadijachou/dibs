// nextFact picks one fact per visit: no repeat within a pass, a fresh shuffle after the last fact, the first of a
// new pass is never the last of the previous one, U and C are independent, and storage trouble falls back to a
// random index without throwing. Pure module, so node --test runs it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextFact, DYK_U_COUNT, DYK_C_COUNT } from './didYouKnow.js'

// A tiny in-memory localStorage stand-in.
function memStore() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    _map: map,
  }
}

// A deterministic random() cycling through a fixed sequence, so a test can force Fisher-Yates.
function seq(values) {
  let i = 0
  return () => values[(i++) % values.length]
}

// Draw `n` visits in a row.
function draw(list, count, n, opts) {
  const out = []
  for (let i = 0; i < n; i++) out.push(nextFact(list, count, opts))
  return out
}

test('no repeat within a pass (every index once)', () => {
  const storage = memStore()
  const random = seq([0.1, 0.5, 0.9, 0.3, 0.7])
  const pass = draw('U', DYK_U_COUNT, DYK_U_COUNT, { storage, random })
  assert.equal(new Set(pass).size, DYK_U_COUNT, 'all indexes distinct in a pass')
  assert.deepEqual([...pass].sort((a, b) => a - b), Array.from({ length: DYK_U_COUNT }, (_, i) => i))
})

test('a new shuffle starts after the last fact of the pass', () => {
  const storage = memStore()
  const random = seq([0.2, 0.8, 0.4, 0.6, 0.15, 0.95])
  const twoPasses = draw('C', DYK_C_COUNT, DYK_C_COUNT * 2, { storage, random })
  const first = twoPasses.slice(0, DYK_C_COUNT)
  const second = twoPasses.slice(DYK_C_COUNT)
  assert.equal(new Set(first).size, DYK_C_COUNT)
  assert.equal(new Set(second).size, DYK_C_COUNT)
})

test('the first of a new pass is not the last of the previous one', () => {
  for (const r of [seq([0, 0, 0, 0]), seq([0.99, 0.01, 0.5, 0.25]), seq([0.5]), seq([0.1, 0.9])]) {
    const storage = memStore()
    const n = DYK_U_COUNT
    const one = draw('U', n, n, { storage, random: r })
    const nextOne = nextFact('U', n, { storage, random: r })
    assert.notEqual(nextOne, one[one.length - 1], 'new pass must not open on the fact just shown')
  }
})

test('count 1 works and never throws', () => {
  const storage = memStore()
  const random = seq([0.4])
  const got = draw('U', 1, 5, { storage, random })
  assert.deepEqual(got, [0, 0, 0, 0, 0])
})

test('a stored order of the wrong length is replaced', () => {
  const storage = memStore()
  storage.setItem('dibs.dyk.U', JSON.stringify({ order: [0, 1, 2], next: 1 })) // length 3, count is 20
  const random = seq([0.3, 0.6, 0.1, 0.8])
  const pass = draw('U', DYK_U_COUNT, DYK_U_COUNT, { storage, random })
  assert.equal(new Set(pass).size, DYK_U_COUNT, 'replaced by a full shuffle of 0..count-1')
})

test('unreadable stored value is replaced without throwing', () => {
  const storage = memStore()
  storage.setItem('dibs.dyk.C', 'not json {')
  const random = seq([0.5, 0.2, 0.7])
  assert.doesNotThrow(() => nextFact('C', DYK_C_COUNT, { storage, random }))
})

test('storage that throws falls back to a random index without throwing', () => {
  const storage = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }
  const random = seq([0.5])
  let got
  assert.doesNotThrow(() => { got = nextFact('U', DYK_U_COUNT, { storage, random }) })
  assert.ok(Number.isInteger(got) && got >= 0 && got < DYK_U_COUNT)
})

test('no storage returns a random index and saves nothing', () => {
  const random = seq([0.0, 0.99])
  const a = nextFact('U', DYK_U_COUNT, { storage: null, random })
  const b = nextFact('U', DYK_U_COUNT, { storage: null, random })
  assert.equal(a, 0)
  assert.equal(b, DYK_U_COUNT - 1)
})

test('U and C positions are independent', () => {
  const storage = memStore()
  const random = seq([0.33, 0.66, 0.11, 0.88, 0.22])
  const u = draw('U', DYK_U_COUNT, DYK_U_COUNT, { storage, random })
  const c = draw('C', DYK_C_COUNT, DYK_C_COUNT, { storage, random })
  assert.equal(new Set(u).size, DYK_U_COUNT)
  assert.equal(new Set(c).size, DYK_C_COUNT)
  // Two keys, kept apart.
  assert.ok(storage._map.has('dibs.dyk.U'))
  assert.ok(storage._map.has('dibs.dyk.C'))
})
