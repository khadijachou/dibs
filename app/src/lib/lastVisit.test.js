import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const mem = new Map()
let reads = 0
globalThis.localStorage = {
  getItem: (k) => { reads++; return mem.has(k) ? mem.get(k) : null },
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}
const { _resetLastVisit, currentEarned, initLastVisit, previousEarned, recordEarned } = await import('./lastVisit.js')

beforeEach(() => { mem.clear(); reads = 0; _resetLastVisit() })

test('prev is read once, before the first write', () => {
  mem.set('dibs.lastEarned', JSON.stringify({ value: 1.5, at: 1000 }))
  initLastVisit()
  recordEarned(1.62)
  recordEarned(1.7)
  assert.deepEqual(previousEarned(), { value: 1.5, at: 1000 })
  assert.equal(reads, 1)
  assert.equal(JSON.parse(mem.get('dibs.lastEarned')).value, 1.7)
})

test('a write before any read still keeps the old value as prev', () => {
  mem.set('dibs.lastEarned', JSON.stringify({ value: 2, at: 5 }))
  recordEarned(3)
  assert.equal(previousEarned().value, 2)
})

test('first launch: no prev; bad values are ignored', () => {
  mem.set('dibs.lastEarned', 'not json')
  assert.equal(previousEarned(), null)
  recordEarned(null)
  recordEarned('x')
  assert.equal(mem.get('dibs.lastEarned'), 'not json')
})

test('currentEarned waits for the first read, at most the timeout', async () => {
  assert.equal(await currentEarned(20), null)
  const p = currentEarned(1000)
  recordEarned(4.2)
  assert.equal(await p, 4.2)
  assert.equal(await currentEarned(0), 4.2)
})
