// Storage for the Friends service. Upstash Redis over REST when its two env vars are set
// (this service gets its OWN Upstash database, never the stats one); otherwise an in-memory store with the
// same interface, used by tests and local runs. All keys are prefixed fr:.
//
// One small interface so both back ends pass the same tests:
//   get(k) / set(k, v)                 JSON value or null
//   del(...keys)                       remove keys (and any set at that key)
//   setIfAbsent(k, v, ttlSeconds?)     atomic "set only if missing" -> boolean (used for codes, wallet link, nonces)
//   expire(k, ttlSeconds)              set a time to live on an existing key
//   sadd / srem / smembers / sismember  sets of strings
//
// Values are JSON on both back ends, so get() always returns a parsed value and the two stores behave the same.

export const PREFIX = 'fr:'

// ---- in-memory ----------------------------------------------------------------------------------------------

export function createMemoryStore() {
  const kv = new Map() // key -> { v: jsonString, exp: ms | null }
  const sets = new Map() // key -> Set<string>
  const now = () => Date.now()
  const live = (e) => e && (!e.exp || e.exp > now())
  const raw = (k) => { const e = kv.get(k); if (!e) return null; if (!live(e)) { kv.delete(k); return null } return e.v }
  return {
    kind: 'memory',
    async get(k) { const v = raw(k); return v == null ? null : JSON.parse(v) },
    async set(k, v) { kv.set(k, { v: JSON.stringify(v), exp: null }) },
    async del(...keys) { for (const k of keys) { kv.delete(k); sets.delete(k) } },
    async setIfAbsent(k, v, ttl) { if (raw(k) != null) return false; kv.set(k, { v: JSON.stringify(v), exp: ttl ? now() + ttl * 1000 : null }); return true },
    async expire(k, ttl) { const e = kv.get(k); if (live(e)) e.exp = now() + ttl * 1000 },
    async sadd(k, ...m) { if (!m.length) return; const s = sets.get(k) || new Set(); for (const x of m) s.add(x); sets.set(k, s) },
    async srem(k, ...m) { const s = sets.get(k); if (!s) return; for (const x of m) s.delete(x); if (!s.size) sets.delete(k) },
    async smembers(k) { return [...(sets.get(k) || [])] },
    async sismember(k, m) { return (sets.get(k) || new Set()).has(m) },
  }
}

// ---- Upstash Redis over REST --------------------------------------------------------------------------------

export function createUpstashStore(url, token) {
  const base = url.replace(/\/$/, '')
  async function pipe(commands) {
    const r = await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands),
    })
    if (!r.ok) throw new Error(`Upstash HTTP ${r.status}`)
    const out = await r.json()
    const bad = out.find((x) => x.error)
    if (bad) throw new Error(`Upstash: ${bad.error}`)
    return out.map((x) => x.result)
  }
  const one = async (cmd) => (await pipe([cmd]))[0]
  return {
    kind: 'upstash',
    async get(k) { const v = await one(['GET', k]); return v == null ? null : JSON.parse(v) },
    async set(k, v) { await one(['SET', k, JSON.stringify(v)]) },
    async del(...keys) { if (keys.length) await one(['DEL', ...keys]) },
    async setIfAbsent(k, v, ttl) { const cmd = ['SET', k, JSON.stringify(v), 'NX']; if (ttl) cmd.push('EX', String(ttl)); return (await one(cmd)) === 'OK' },
    async expire(k, ttl) { await one(['EXPIRE', k, String(ttl)]) },
    async sadd(k, ...m) { if (m.length) await one(['SADD', k, ...m]) },
    async srem(k, ...m) { if (m.length) await one(['SREM', k, ...m]) },
    async smembers(k) { return (await one(['SMEMBERS', k])) || [] },
    async sismember(k, m) { return (await one(['SISMEMBER', k, m])) === 1 },
  }
}

// Picks the back end from the environment. Warns loudly when data is not kept.
export function createStore(env = process.env) {
  const url = (env.UPSTASH_REDIS_REST_URL || '').trim()
  const token = (env.UPSTASH_REDIS_REST_TOKEN || '').trim()
  if (url && token) return createUpstashStore(url, token)
  console.warn('friends: no Upstash configured, using an in-memory store. Data is NOT kept across restarts.')
  return createMemoryStore()
}
