// Dibs Friends: identity linked to the wallet, friend codes, invites, and who sees what.
// It never stores or returns a wallet address, a wallet public key, a gift card code, a PIN, an email,
// a NIM amount, a transaction hash or an IP address. Log lines hold a route, a status and a duration only.
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { pathToFileURL } from 'node:url'
import { createStore } from './store.js'
import {
  verifyWalletSignature, verifyDeviceSignature, addressOf, walletKey, randomId, friendCode, sha256hex, isHex64, CODE_RE,
} from './crypto.js'
import {
  cleanName, cleanVisibility, cleanLook, fullVisibility, applyShared, pruneShared, visibleProfile, sharesNothing, sharedHasError, wishesFor,
} from './rules.js'
import {
  MAX_OPEN_CLAIMS, claim, release, markSent, thank, ownerClaims, sentGifts, dropClaimedBetween, dropAllFor, openClaimCount,
} from './gifts.js'
import {
  BOARDS, boardsChoice, boardMembers, setBoards, xpOf, dropBoardsFor, makeChecker, monthOf,
} from './boards.js'

export const VERSION = '1.7.0'
const AVATAR_ROW_CAP = 50 // avatars travel on at most the first 50 friend rows (size guard)

const MINUTE = 60_000
const REGISTER_MESSAGE_WINDOW = 10 * MINUTE
const DEVICE_TS_WINDOW = 5 * MINUTE
const NONCE_TTL = 10 * 60 // seconds
const DECLINE_TTL = 7 * 24 * 60 * 60 // seconds a declined invite stays visible to its sender
const MAX_DEVICES = 5
const MAX_FRIENDS = 200
const MAX_INVITES = 50

const json = (v) => JSON.stringify(v)
const parseJson = (text) => { if (!text) return null; try { return JSON.parse(text) } catch { return null } }

// Simple sliding-window counter, kept in memory only (never stored). Returns true while within the limit.
function limiter() {
  const hits = new Map()
  return (key, windowMs, max) => {
    const now = Date.now()
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs)
    arr.push(now)
    hits.set(key, arr)
    return arr.length <= max
  }
}

const ipOf = (c) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.env?.incoming?.socket?.remoteAddress || 'unknown'

export function makeApp(store, env = process.env, opts = {}) {
  const app = new Hono()

  // Keys (all prefixed fr:).
  const uKey = (id) => `fr:u:${id}`
  const sharedKey = (id) => `fr:shared:${id}`
  const codeKey = (code) => `fr:code:${code}`
  const wkKey = (wk) => `fr:wk:${wk}`
  const friendsKey = (id) => `fr:friends:${id}`
  const sinceKey = (a, b) => `fr:since:${a}:${b}`
  const invKey = (id) => `fr:inv:${id}`
  const inboxKey = (id) => `fr:in:${id}`
  const sentKey = (id) => `fr:out:${id}`
  const pairKey = (from, to) => `fr:pair:${from}:${to}`

  const loadUser = (id) => store.get(uKey(id))
  const saveUser = (u) => store.set(uKey(u.id), u)
  // The chain-check queue for board deposit XP (in memory). Tests pass their own; otherwise one is built from the env.
  const checker = opts.checker || makeChecker(store, { loadUser, rpcUrl: env.NIMIQ_RPC_URL })
  app.__checker = checker // exposed so the run-directly block (and tests) can drive checker.tick()
  const loadShared = async (id) => (await store.get(sharedKey(id))) || {}
  // Public identity only: never the walletKey, never the stored user object as-is.
  const meObject = (u) => ({ id: u.id, code: u.code, name: u.name, visibility: fullVisibility(u.visibility), look: cleanLook(u.look) })

  async function uniqueCode(id) {
    for (const len of [4, 5]) {
      for (let i = 0; i < 20; i++) { const code = friendCode(len); if (await store.setIfAbsent(codeKey(code), id)) return code }
    }
    throw new Error('could not allocate a friend code')
  }

  async function makeFriends(a, b) {
    const since = new Date().toISOString()
    await store.sadd(friendsKey(a), b)
    await store.sadd(friendsKey(b), a)
    await store.set(sinceKey(a, b), since)
    await store.set(sinceKey(b, a), since)
  }

  async function removeInvite(iid) {
    const inv = await store.get(invKey(iid))
    if (!inv) return
    await store.srem(sentKey(inv.from), iid)
    await store.srem(inboxKey(inv.to), iid)
    await store.del(pairKey(inv.from, inv.to), invKey(iid))
  }

  const limitReq = limiter()
  const limitIp = limiter()
  const limitLookupMin = limiter()
  const limitLookupDay = limiter()
  const limitXp = limiter() // reporting a deposit hash: a write, rate-limited per id

  // ---- middleware ---------------------------------------------------------------------------------------------

  // Logging: route pattern, status and duration only. Never a path with an id, a query, a name, a code or a body.
  app.use('/v1/*', async (c, next) => {
    const t0 = Date.now()
    await next()
    console.log(`${c.req.method} ${c.req.routePath || '/v1/*'} ${c.res.status} ${Date.now() - t0}ms`)
  })

  // CORS: the configured origins, or closed in production and open in development when none are set.
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const corsOrigin = origins.length ? origins : (env.NODE_ENV === 'production' ? [] : '*')
  app.use('/v1/*', cors({
    origin: corsOrigin,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Dibs-Id', 'X-Dibs-Ts', 'X-Dibs-Nonce', 'X-Dibs-Sig'],
  }))

  // Read the raw body once (device signatures hash the exact bytes) and cap it: 32 KB for the shared upload (an avatar
  // plus the rest no longer fits in 16), 16 KB for every other route.
  app.use('/v1/*', async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') { c.set('rawBody', ''); return next() }
    const text = await c.req.text().catch(() => '')
    const limit = (c.req.method === 'PUT' && new URL(c.req.url).pathname === '/v1/me/shared') ? 32 * 1024 : 16 * 1024
    if (text.length > limit) return c.json({ error: 'TOO_LARGE' }, 413)
    c.set('rawBody', text)
    await next()
  })

  // Device signature on every route but health and register.
  app.use('/v1/*', async (c, next) => {
    const path = new URL(c.req.url).pathname
    if (path === '/v1/health' || path === '/v1/register') return next()

    const id = c.req.header('X-Dibs-Id') || ''
    if (!limitReq(id || 'anon', MINUTE, 120)) return c.json({ error: 'LIMIT' }, 429)

    const fail = () => c.json({ error: 'UNAUTHORIZED' }, 401)
    const ts = Number(c.req.header('X-Dibs-Ts'))
    const nonce = c.req.header('X-Dibs-Nonce') || ''
    const sig = c.req.header('X-Dibs-Sig') || ''
    if (!id || !Number.isFinite(ts) || !/^[0-9a-f]{16,}$/i.test(nonce) || !/^[0-9a-f]{128}$/i.test(sig)) return fail()
    if (Math.abs(Date.now() - ts) > DEVICE_TS_WINDOW) return fail()
    const user = await loadUser(id)
    if (!user) return fail()
    const u = new URL(c.req.url)
    const canonical = `${c.req.method}\n${u.pathname}${u.search}\n${ts}\n${nonce}\n${sha256hex(c.get('rawBody') || '')}`
    if (!(user.devices || []).some((pub) => verifyDeviceSignature(pub, canonical, sig))) return fail()
    // Replay guard: the nonce must be fresh for this id. Checked after the signature so nonces cannot be burned.
    if (!(await store.setIfAbsent(`fr:nonce:${id}:${nonce}`, 1, NONCE_TTL))) return fail()

    c.set('user', user)
    c.set('me', id)
    await next()
  })

  // ---- health -------------------------------------------------------------------------------------------------

  app.get('/v1/health', (c) => c.json({ ok: true, store: store.kind, version: VERSION }))

  // ---- register / identity ------------------------------------------------------------------------------------

  app.post('/v1/register', async (c) => {
    if (!limitIp(ipOf(c), MINUTE, 10)) return c.json({ error: 'LIMIT' }, 429)
    const body = parseJson(c.get('rawBody'))
    if (!body) return c.json({ error: 'BAD_REQUEST' }, 400)
    const { name, devicePub, wallet } = body
    if (!isHex64(devicePub)) return c.json({ error: 'BAD_REQUEST' }, 400)
    const cleanedName = cleanName(name)
    if (cleanedName === null) return c.json({ error: 'BAD_NAME' }, 400)
    if (!wallet || typeof wallet !== 'object') return c.json({ error: 'BAD_WALLET' }, 400)

    const { message, publicKey, signature } = wallet
    if (typeof message !== 'string') return c.json({ error: 'BAD_WALLET' }, 400)
    const lines = message.split('\n')
    if (lines.length !== 3
      || lines[0] !== 'Dibs Friends: link this wallet'
      || lines[1] !== `Device: ${devicePub}`
      || !lines[2].startsWith('Time: ')) return c.json({ error: 'BAD_WALLET' }, 400)
    const t = Date.parse(lines[2].slice('Time: '.length))
    if (!Number.isFinite(t) || Math.abs(Date.now() - t) > REGISTER_MESSAGE_WINDOW) return c.json({ error: 'BAD_WALLET' }, 400)
    if (!verifyWalletSignature({ message, publicKey, signature })) return c.json({ error: 'BAD_WALLET' }, 400)

    const wk = walletKey(addressOf(publicKey))

    // New phone for an existing wallet: add the device key (max 5, oldest dropped) and keep everything else.
    const restore = async (user) => {
      const devices = (user.devices || []).filter((d) => d !== devicePub)
      devices.push(devicePub)
      user.devices = devices.slice(-MAX_DEVICES)
      await saveUser(user)
      return c.json({ restored: true, ...meObject(user) })
    }

    const existingId = await store.get(wkKey(wk))
    if (existingId) { const user = await loadUser(existingId); if (user) return restore(user) }

    const id = randomId()
    // Claim the wallet link atomically; if another device just created it, restore onto that account.
    if (!(await store.setIfAbsent(wkKey(wk), id))) {
      const otherId = await store.get(wkKey(wk))
      const other = otherId && await loadUser(otherId)
      if (other) return restore(other)
    }
    const code = await uniqueCode(id)
    const user = { id, wk, code, name: cleanedName, devices: [devicePub], createdAt: new Date().toISOString(), visibility: fullVisibility({}), look: {} }
    await saveUser(user)
    return c.json({ restored: false, ...meObject(user) })
  })

  // ---- me -----------------------------------------------------------------------------------------------------

  // The gifts the owner has received: state 'sent' only (never a claim in state 'claimed', so the surprise holds),
  // each with the giver's identity. [{ brandKey, from: { id, name, seed }, thanked }].
  async function giftsReceived(ownerId) {
    const out = []
    for (const g of await sentGifts(store, ownerId)) {
      const from = await loadUser(g.by)
      if (from) out.push({ brandKey: g.brandKey, from: { id: from.id, name: from.name, seed: from.id }, thanked: g.thanked })
    }
    return out
  }

  app.get('/v1/me', async (c) => {
    const u = c.get('user')
    const shared = await loadShared(u.id)
    const prof = visibleProfile({ id: u.id, name: u.name, visibility: u.visibility, shared, look: u.look }, 'self')
    return c.json({ ...prof, code: u.code, gifts: await giftsReceived(u.id), boards: boardsChoice(u) })
  })

  app.get('/v1/me/as-friend', async (c) => {
    const u = c.get('user')
    const shared = await loadShared(u.id)
    return c.json(visibleProfile({ id: u.id, name: u.name, visibility: u.visibility, shared, look: u.look }, 'friend'))
  })

  app.patch('/v1/me', async (c) => {
    const u = c.get('user')
    const body = parseJson(c.get('rawBody'))
    if (!body) return c.json({ error: 'BAD_REQUEST' }, 400)
    if ('name' in body) { const n = cleanName(body.name); if (n === null) return c.json({ error: 'BAD_NAME' }, 400); u.name = n }
    if ('visibility' in body) u.visibility = fullVisibility({ ...u.visibility, ...cleanVisibility(body.visibility) })
    if ('look' in body) u.look = cleanLook(body.look)
    await saveUser(u)
    // Turning an item off deletes its stored data at once.
    const shared = await loadShared(u.id)
    const pruned = pruneShared(shared, u.visibility)
    if (json(pruned) !== json(shared)) await store.set(sharedKey(u.id), pruned)
    return c.json(meObject(u))
  })

  app.put('/v1/me/shared', async (c) => {
    const u = c.get('user')
    const body = parseJson(c.get('rawBody'))
    if (!body) return c.json({ error: 'BAD_REQUEST' }, 400)
    // A present-but-malformed strict field (totals, avatar, or a value) is rejected and nothing is stored.
    if (sharedHasError(body, u.visibility)) return c.json({ error: 'BAD_REQUEST' }, 400)
    const current = await loadShared(u.id)
    const next = applyShared(current, body, u.visibility)
    await store.set(sharedKey(u.id), next)
    return c.json(next)
  })

  app.delete('/v1/me', async (c) => {
    const u = c.get('user')
    const id = u.id
    for (const f of await store.smembers(friendsKey(id))) { await store.srem(friendsKey(f), id); await store.del(sinceKey(f, id), sinceKey(id, f)) }
    for (const iid of await store.smembers(inboxKey(id))) { const inv = await store.get(invKey(iid)); if (inv) { await store.srem(sentKey(inv.from), iid); await store.del(pairKey(inv.from, inv.to)) } await store.del(invKey(iid)) }
    for (const iid of await store.smembers(sentKey(id))) { const inv = await store.get(invKey(iid)); if (inv) { await store.srem(inboxKey(inv.to), iid); await store.del(pairKey(inv.from, inv.to)) } await store.del(invKey(iid)) }
    await dropAllFor(store, id) // every claim and gift where this user is giver or owner
    await dropBoardsFor(store, id) // off every board, and every monthly XP record gone
    invalidateGlobal()
    await store.del(friendsKey(id), inboxKey(id), sentKey(id), wkKey(u.wk), codeKey(u.code), sharedKey(id), uKey(id))
    return c.json({ ok: true })
  })

  // ---- leaderboards -------------------------------------------------------------------------------------------
  // Opt-in, by XP the server has checked (deposits only), this UTC month. Rows never carry a wallet address or a hash.

  let globalCache = null // the computed Global board, cached 60 s; cleared at once when a membership changes
  const invalidateGlobal = () => { globalCache = null }

  // Join or leave the boards. { friends, global } booleans. Joining sets joinedAt once; leaving removes the user at once.
  app.put('/v1/me/boards', async (c) => {
    const u = c.get('user')
    const body = parseJson(c.get('rawBody'))
    if (!body || typeof body !== 'object') return c.json({ error: 'BAD_REQUEST' }, 400)
    const want = { friends: body.friends === true, global: body.global === true }
    await setBoards(store, u, want)
    await saveUser(u)
    invalidateGlobal()
    return c.json({ boards: boardsChoice(u) })
  })

  // Report a deposit to be checked on the chain and counted (background, like the orders server). Accepted only while
  // the user is on at least one board. The hash is a 64-hex transaction id; it is never stored, only checked and
  // fingerprinted for dedupe. A valid report always answers { queued: true }; the counting happens later.
  app.post('/v1/me/xp/deposit', async (c) => {
    const me = c.get('me')
    const u = c.get('user')
    if (!limitXp(me, MINUTE, 20)) return c.json({ error: 'LIMIT' }, 429)
    if (!boardsChoice(u).friends && !boardsChoice(u).global) return c.json({ error: 'NOT_ON_BOARD' }, 409)
    const body = parseJson(c.get('rawBody'))
    const tx = typeof body?.tx === 'string' ? body.tx.toLowerCase() : ''
    if (!isHex64(tx)) return c.json({ error: 'BAD_REQUEST' }, 400)
    checker.enqueue(u.id, tx)
    return c.json({ queued: true })
  })

  // Is a member's level visible to this viewer? Their level visibility (friends / everyone / off) decides it, with self
  // always able to see its own. `friend` says whether the viewer is a friend of the member.
  const levelVisible = (member, relation) => {
    if (relation === 'self') return true
    const v = fullVisibility(member.visibility).level
    return v === 'everyone' || (v === 'friends' && relation === 'friend')
  }
  // Build one board row for a member id. relation: 'self' | 'friend' | 'stranger'. Carries only id (the avatar seed),
  // name, xp, and level when visible. Never an avatar picture, a wallet or anything else from the profile.
  async function boardRow(id, relation, month) {
    const u = await loadUser(id)
    if (!u) return null
    const row = { id: u.id, name: u.name, xp: await xpOf(store, id, month) }
    if (levelVisible(u, relation)) { const sh = await loadShared(id); if (sh.level) row.level = sh.level.level }
    // The Friends board shows a friend's name in their accent and their avatar in their rank frame (their stored look,
    // which the client only ever sends while they share level and rank). The Global board carries no look at all.
    if (relation !== 'stranger') row.look = cleanLook(u.look)
    return row
  }
  const byXp = (a, b) => b.xp - a.xp || (a.id < b.id ? -1 : 1)
  const placed = (rows) => rows.map((r, i) => ({ place: i + 1, ...r }))

  // The Friends board: me plus my friends who joined it, this month. Returned only when I have at least 3 friends.
  app.get('/v1/boards/friends', async (c) => {
    const me = c.get('me')
    const friendIds = await store.smembers(friendsKey(me))
    if (friendIds.length < 3) return c.json({ needFriends: true, friends: friendIds.length })
    const month = monthOf(Date.now())
    const onBoard = []
    for (const fid of friendIds) if (await store.sismember(`fr:board:friends`, fid)) onBoard.push(fid)
    const rows = []
    const mine = await boardRow(me, 'self', month)
    if (mine) rows.push(mine)
    for (const fid of onBoard) { const r = await boardRow(fid, 'friend', month); if (r) rows.push(r) }
    rows.sort(byXp)
    return c.json({ board: 'friends', month, count: onBoard.length, rows: placed(rows) })
  })

  // The Global board (cached 60 s): the top 5 and my own row with my place, plus the total number of members. Global
  // rows carry only name, level (everyone-visible, or my own) and xp, with the id for the identicon.
  async function globalRanking() {
    if (globalCache && Date.now() - globalCache.at < 60_000) return globalCache
    const month = monthOf(Date.now())
    const ids = await boardMembers(store, 'global')
    const scored = []
    for (const id of ids) { const r = await boardRow(id, 'stranger', month); if (r) scored.push(r) }
    scored.sort(byXp)
    globalCache = { at: Date.now(), month, rows: placed(scored) }
    return globalCache
  }
  app.get('/v1/boards/global', async (c) => {
    const me = c.get('me')
    const u = c.get('user')
    const { month, rows } = await globalRanking()
    const top = rows.slice(0, 5)
    const mineRanked = rows.find((r) => r.id === me) || null
    let mine = null
    if (mineRanked) {
      // My own row: show my level to myself even when my level is not set to everyone.
      mine = { ...mineRanked }
      if (mine.level === undefined) { const sh = await loadShared(me); if (fullVisibility(u.visibility).level !== 'off' && sh.level) mine.level = sh.level.level }
    }
    return c.json({ board: 'global', month, count: rows.length, top, me: mine })
  })

  // ---- lookup -------------------------------------------------------------------------------------------------

  app.get('/v1/lookup', async (c) => {
    const me = c.get('me')
    if (!limitLookupMin(me, MINUTE, 10) || !limitLookupDay(me, 24 * 60 * MINUTE, 100)) return c.json({ error: 'LIMIT' }, 429)
    const code = (c.req.query('code') || '').toUpperCase()
    if (!CODE_RE.test(code)) return c.json({ error: 'BAD_CODE' }, 404)
    const id = await store.get(codeKey(code))
    if (!id) return c.json({ error: 'BAD_CODE' }, 404)
    if (id === me) return c.json({ error: 'OWN_CODE' }, 400)
    const u = await loadUser(id)
    if (!u) return c.json({ error: 'BAD_CODE' }, 404)
    const out = { id: u.id, name: u.name, seed: u.id }
    if (fullVisibility(u.visibility).level !== 'off') { const sh = await loadShared(id); if (sh.level) { out.level = sh.level.level; out.rank = sh.level.rank } }
    return c.json(out)
  })

  // ---- invites ------------------------------------------------------------------------------------------------

  app.post('/v1/invites', async (c) => {
    const me = c.get('me')
    const body = parseJson(c.get('rawBody'))
    const code = (body?.code || '').toUpperCase()
    if (!CODE_RE.test(code)) return c.json({ error: 'BAD_CODE' }, 404)
    const toId = await store.get(codeKey(code))
    if (!toId) return c.json({ error: 'BAD_CODE' }, 404)
    if (toId === me) return c.json({ error: 'OWN_CODE' }, 400)
    if (await store.sismember(friendsKey(me), toId)) return c.json({ error: 'ALREADY_FRIENDS' }, 409)

    // A pending invite the other way: both become friends at once.
    const reverse = await store.get(pairKey(toId, me))
    if (reverse) { await makeFriends(me, toId); await removeInvite(reverse); return c.json({ friends: true }) }

    // A pending invite the same way: return the same invite.
    const existing = await store.get(pairKey(me, toId))
    if (existing) { const inv = await store.get(invKey(existing)); if (inv) return c.json({ invite: { id: inv.id } }) }

    if ((await store.smembers(friendsKey(me))).length >= MAX_FRIENDS) return c.json({ error: 'LIMIT' }, 429)
    if ((await store.smembers(sentKey(me))).length >= MAX_INVITES) return c.json({ error: 'LIMIT' }, 429)
    if ((await store.smembers(inboxKey(toId))).length >= MAX_INVITES) return c.json({ error: 'LIMIT' }, 429)

    const iid = randomId()
    const inv = { id: iid, from: me, to: toId, at: new Date().toISOString() }
    await store.set(invKey(iid), inv)
    await store.sadd(sentKey(me), iid)
    await store.sadd(inboxKey(toId), iid)
    await store.setIfAbsent(pairKey(me, toId), iid)
    return c.json({ invite: { id: iid } })
  })

  app.post('/v1/invites/:id/accept', async (c) => {
    const me = c.get('me')
    const iid = c.req.param('id')
    const inv = await store.get(invKey(iid))
    if (!inv || inv.to !== me) return c.json({ error: 'NOT_FOUND' }, 404)
    await makeFriends(inv.from, inv.to)
    await removeInvite(iid)
    return c.json({ friends: true })
  })

  // Receiver declines or sender cancels: silent either way. A declined invite stays visible to its sender
  // (as sent) for 7 days, then it expires quietly; the other side is never told.
  app.delete('/v1/invites/:id', async (c) => {
    const me = c.get('me')
    const iid = c.req.param('id')
    const inv = await store.get(invKey(iid))
    if (!inv || (inv.to !== me && inv.from !== me)) return c.json({ error: 'NOT_FOUND' }, 404)
    if (inv.from === me) {
      await removeInvite(iid)
    } else {
      await store.srem(inboxKey(me), iid)
      await store.del(pairKey(inv.from, inv.to))
      await store.expire(invKey(iid), DECLINE_TTL)
    }
    return c.json({ ok: true })
  })

  // ---- friends ------------------------------------------------------------------------------------------------

  app.get('/v1/friends', async (c) => {
    const me = c.get('me')
    const invites = []
    for (const iid of await store.smembers(inboxKey(me))) {
      const inv = await store.get(invKey(iid))
      if (!inv) { await store.srem(inboxKey(me), iid); continue }
      const from = await loadUser(inv.from)
      if (from) invites.push({ id: inv.id, from: { id: from.id, name: from.name, seed: from.id } })
    }
    const sent = []
    for (const iid of await store.smembers(sentKey(me))) {
      const inv = await store.get(invKey(iid))
      if (!inv) { await store.srem(sentKey(me), iid); continue }
      const to = await loadUser(inv.to)
      if (to) sent.push({ id: inv.id, to: { id: to.id, name: to.name, seed: to.id } })
    }
    const friends = []
    let i = 0
    for (const fid of await store.smembers(friendsKey(me))) {
      const f = await loadUser(fid)
      if (!f) { await store.srem(friendsKey(me), fid); continue }
      const vF = fullVisibility(f.visibility)
      const row = { id: f.id, name: f.name, seed: f.id, since: await store.get(sinceKey(me, fid)), look: cleanLook(f.look), sharesNothing: sharesNothing(f.visibility) }
      // The avatar rides on at most the first 50 rows; the level is unbounded. No totals on rows (it would read as a ranking).
      const wantAvatar = i < AVATAR_ROW_CAP && vF.avatar !== 'off'
      const sh = (vF.level !== 'off' || wantAvatar) ? await loadShared(fid) : null
      if (sh?.level && vF.level !== 'off') { row.level = sh.level.level; row.rank = sh.level.rank }
      if (sh?.avatar && wantAvatar) row.avatar = sh.avatar
      i += 1
      friends.push(row)
    }
    return c.json({ invites, sent, friends })
  })

  app.delete('/v1/friends/:id', async (c) => {
    const me = c.get('me')
    const fid = c.req.param('id')
    await store.srem(friendsKey(me), fid)
    await store.srem(friendsKey(fid), me)
    await store.del(sinceKey(me, fid), sinceKey(fid, me))
    await dropClaimedBetween(store, me, fid) // claims in state 'claimed' between the two go; sent gifts stay
    return c.json({ ok: true })
  })

  // ---- a user's profile for me as viewer ----------------------------------------------------------------------

  app.get('/v1/users/:id', async (c) => {
    const me = c.get('me')
    const id = c.req.param('id')
    const u = await loadUser(id)
    if (!u) return c.json({ error: 'NOT_FOUND' }, 404)
    const rel = id === me ? 'self' : (await store.sismember(friendsKey(me), id)) ? 'friend' : 'stranger'
    const shared = await loadShared(id)
    const prof = visibleProfile({ id: u.id, name: u.name, visibility: u.visibility, shared, look: u.look }, rel)
    // A friend viewing the owner also learns the status of each wish on the owner's visible wishlist, from their own
    // side only. Never on the owner's own views (self) or a stranger's: the surprise holds. visibleProfile only
    // exposes `wishlist` when its visibility is friends/everyone, so `prof.wishlist` is the visible list.
    if (rel === 'friend' && Array.isArray(prof.wishlist) && prof.wishlist.length) {
      prof.wishes = wishesFor(prof.wishlist, await ownerClaims(store, id), me)
    }
    return c.json(prof)
  })

  // ---- gifts: call dibs on a friend's wish --------------------------------------------------------------------
  // A claim = (owner id, brand key) -> { by: giver id, state: 'claimed' | 'sent', thanked }. The giver saves for the
  // card in their OWN account and sends the code themselves; the server never sees a code, a value or an amount.

  const BRAND_RE = /^[a-z0-9_-]{1,32}$/

  // Can `me` call dibs on `owner`'s wish for `brand`? Allowed only when they are friends, the owner shares the
  // wishlist (friends or everyone) and the brand is on it. Any failure is the same 404, so nothing leaks.
  async function canClaim(me, owner, brand) {
    if (!BRAND_RE.test(brand) || owner === me) return false
    const u = await loadUser(owner)
    if (!u) return false
    if (!(await store.sismember(friendsKey(me), owner))) return false
    if (fullVisibility(u.visibility).wishlist === 'off') return false
    const shared = await loadShared(owner)
    return Array.isArray(shared.wishlist) && shared.wishlist.includes(brand)
  }

  app.post('/v1/users/:id/wishes/:brandKey/claim', async (c) => {
    const me = c.get('me')
    const owner = c.req.param('id')
    const brand = c.req.param('brandKey')
    if (!(await canClaim(me, owner, brand))) return c.json({ error: 'NOT_FOUND' }, 404)
    const r = await claim(store, owner, brand, me)
    if (r === 'taken') return c.json({ error: 'TAKEN' }, 409)
    if (r === 'again') return c.json({ ok: true, state: 'claimed' }) // idempotent for the same giver
    if ((await openClaimCount(store, me)) > MAX_OPEN_CLAIMS) { await release(store, owner, brand, me); return c.json({ error: 'LIMIT' }, 429) }
    return c.json({ ok: true, state: 'claimed' })
  })

  app.delete('/v1/users/:id/wishes/:brandKey/claim', async (c) => {
    const me = c.get('me')
    const r = await release(store, c.req.param('id'), c.req.param('brandKey'), me)
    if (r === 'not_found') return c.json({ error: 'NOT_FOUND' }, 404)
    if (r === 'sent') return c.json({ error: 'SENT' }, 409) // a sent gift cannot be released
    return c.json({ ok: true })
  })

  app.post('/v1/users/:id/wishes/:brandKey/sent', async (c) => {
    const me = c.get('me')
    const r = await markSent(store, c.req.param('id'), c.req.param('brandKey'), me)
    if (r === 'not_found') return c.json({ error: 'NOT_FOUND' }, 404)
    return c.json({ ok: true, state: 'sent' })
  })

  app.post('/v1/me/gifts/:brandKey/thanks', async (c) => {
    const me = c.get('me')
    const r = await thank(store, me, c.req.param('brandKey'))
    if (r === 'not_found') return c.json({ error: 'NOT_FOUND' }, 404)
    return c.json({ ok: true, thanked: true })
  })

  app.notFound((c) => c.json({ error: 'NOT_FOUND' }, 404))
  app.onError((err, c) => { console.log(`ERROR ${c.req.routePath || '/v1/*'} ${err?.name || 'Error'}`); return c.json({ error: 'SERVER_ERROR' }, 500) })

  return app
}

// Run directly: refuse to start without a salt in production, then build the real store and listen.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV === 'production' && !process.env.FRIENDS_SALT) {
    console.error('FRIENDS_SALT is required in production (rotating it unlinks every wallet). Refusing to start.')
    process.exit(1)
  }
  const store = createStore()
  const app = makeApp(store)
  // Drain the board deposit-check queue twice a second (two RPC calls a second at most), like the orders server.
  setInterval(() => { app.__checker.tick().catch(() => { /* a hiccup: retried on the next tick */ }) }, 500).unref()
  const port = Number(process.env.PORT || 8788)
  serve({ fetch: app.fetch, port }, () => console.log(`friends server on http://localhost:${port} (store: ${store.kind}, version ${VERSION})`))
}
