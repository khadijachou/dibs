import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryStore, createUpstashStore } from './store.js'

// ---- the in-memory store (the one tests and local runs use) --------------------------------------------------

test('memory: get/set round-trips JSON values', async () => {
  const s = createMemoryStore()
  assert.equal(await s.get('fr:x'), null)
  await s.set('fr:x', { a: 1, b: ['y'] })
  assert.deepEqual(await s.get('fr:x'), { a: 1, b: ['y'] })
})

test('memory: del removes keys and sets', async () => {
  const s = createMemoryStore()
  await s.set('fr:a', 1)
  await s.sadd('fr:s', 'm')
  await s.del('fr:a', 'fr:s')
  assert.equal(await s.get('fr:a'), null)
  assert.deepEqual(await s.smembers('fr:s'), [])
})

test('memory: setIfAbsent is atomic (true once, then false)', async () => {
  const s = createMemoryStore()
  assert.equal(await s.setIfAbsent('fr:code:AB', 'id1'), true)
  assert.equal(await s.setIfAbsent('fr:code:AB', 'id2'), false)
  assert.equal(await s.get('fr:code:AB'), 'id1')
})

test('memory: expired setIfAbsent key frees up', async () => {
  const s = createMemoryStore()
  assert.equal(await s.setIfAbsent('fr:n', 1, 0.05), true) // 50 ms ttl
  assert.equal(await s.setIfAbsent('fr:n', 1, 0.05), false)
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(await s.setIfAbsent('fr:n', 1, 0.05), true)
})

test('memory: set operations', async () => {
  const s = createMemoryStore()
  await s.sadd('fr:f', 'a', 'b', 'a')
  assert.deepEqual((await s.smembers('fr:f')).sort(), ['a', 'b'])
  assert.equal(await s.sismember('fr:f', 'a'), true)
  assert.equal(await s.sismember('fr:f', 'z'), false)
  await s.srem('fr:f', 'a')
  assert.deepEqual(await s.smembers('fr:f'), ['b'])
})

// ---- the Upstash client, exercised against a mocked fetch (never a real database) ----------------------------

function mockUpstash() {
  const kv = new Map(), sets = new Map(), seen = []
  const run = (cmd) => {
    const [op, key, ...rest] = cmd
    switch (op) {
      case 'GET': return kv.has(key) ? kv.get(key) : null
      case 'SET': {
        const value = rest[0]
        const nx = rest.includes('NX')
        if (nx && kv.has(key)) return null
        kv.set(key, value)
        return 'OK'
      }
      case 'DEL': { for (const k of [key, ...rest]) { kv.delete(k); sets.delete(k) } return 1 }
      case 'EXPIRE': return 1
      case 'SADD': { const set = sets.get(key) || new Set(); for (const m of rest) set.add(m); sets.set(key, set); return rest.length }
      case 'SREM': { const set = sets.get(key); if (set) for (const m of rest) set.delete(m); return 1 }
      case 'SMEMBERS': return [...(sets.get(key) || [])]
      case 'SISMEMBER': return (sets.get(key) || new Set()).has(rest[0]) ? 1 : 0
      default: return null
    }
  }
  const fetchMock = async (url, opts) => {
    assert.ok(url.endsWith('/pipeline'))
    assert.equal(opts.headers.authorization, 'Bearer TOKEN')
    const cmds = JSON.parse(opts.body)
    seen.push(...cmds)
    return { ok: true, json: async () => cmds.map((cmd) => ({ result: run(cmd) })) }
  }
  return { fetchMock, seen }
}

test('upstash: round-trips values and builds the right commands', async () => {
  const { fetchMock, seen } = mockUpstash()
  const real = global.fetch
  global.fetch = fetchMock
  try {
    const s = createUpstashStore('https://db.example.com/', 'TOKEN')
    await s.set('fr:u:1', { id: '1' })
    assert.deepEqual(await s.get('fr:u:1'), { id: '1' })
    assert.equal(await s.setIfAbsent('fr:code:AA', '1'), true)
    assert.equal(await s.setIfAbsent('fr:code:AA', '2'), false)
    await s.setIfAbsent('fr:nonce:x', 1, 600)
    await s.sadd('fr:f:1', 'a', 'b')
    assert.deepEqual((await s.smembers('fr:f:1')).sort(), ['a', 'b'])
    assert.equal(await s.sismember('fr:f:1', 'a'), true)
    await s.expire('fr:nonce:x', 600)
    await s.del('fr:u:1')
  } finally {
    global.fetch = real
  }
  // command shapes
  assert.deepEqual(seen.find((c) => c[0] === 'SET' && c[1] === 'fr:u:1'), ['SET', 'fr:u:1', JSON.stringify({ id: '1' })])
  assert.deepEqual(seen.find((c) => c[1] === 'fr:nonce:x' && c[0] === 'SET'), ['SET', 'fr:nonce:x', '1', 'NX', 'EX', '600'])
  assert.deepEqual(seen.find((c) => c[0] === 'SADD'), ['SADD', 'fr:f:1', 'a', 'b'])
  assert.deepEqual(seen.find((c) => c[0] === 'EXPIRE'), ['EXPIRE', 'fr:nonce:x', '600'])
})

test('upstash: an error result rejects', async () => {
  const real = global.fetch
  global.fetch = async () => ({ ok: true, json: async () => [{ error: 'WRONGTYPE' }] })
  try {
    const s = createUpstashStore('https://db.example.com', 'TOKEN')
    await assert.rejects(() => s.get('fr:x'), /Upstash: WRONGTYPE/)
  } finally {
    global.fetch = real
  }
})
