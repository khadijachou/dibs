// Direct gifts (v1.7.4): a gift a user sends from their OWN goal to a friend, NOT tied to any wish. A record is keyed by
// a client-generated giftId (32 hex, from crypto.getRandomValues on the phone) so a retried send never creates two. The
// server learns who sent which brand to whom, the optional message and banner, and relays the sealed code boxes (v1.7.3)
// which it can never read. It NEVER stores a code, a PIN, a link, a value or an amount. The message and banner are shown
// only to the receiver (GET /v1/me) and, giver-only, delivered/opened/thanked flags to the giver (GET /v1/users/:id).
import { applyDeliver, applyOpen, boxFor } from './gifts.js'

export const MAX_PER_DAY = 20 // direct gifts a giver may send per UTC day
export const MAX_PER_RECEIVER = 100 // newest records kept per receiver; the oldest drop with their index entries
export const GIFT_ID_RE = /^[0-9a-f]{32}$/ // 32 hex chars, generated on the phone

// Keys (all prefixed fr:). A record, plus two indexes so we can list a receiver's gifts and a giver's gifts.
const giftKey = (id) => `fr:dgift:${id}`
const toSetKey = (receiver) => `fr:dgifts:to:${receiver}`
const bySetKey = (giver) => `fr:dgifts:by:${giver}`
const utcDay = (iso) => String(iso || '').slice(0, 10)

export const getDirectGift = (store, id) => store.get(giftKey(id))

async function removeGift(store, id, rec) {
  await store.del(giftKey(id))
  if (rec?.receiver) await store.srem(toSetKey(rec.receiver), id)
  if (rec?.giver) await store.srem(bySetKey(rec.giver), id)
}

// Drop the receiver's oldest records beyond MAX_PER_RECEIVER (by sentAt). Prunes stale index members along the way.
async function capReceiver(store, receiver) {
  const recs = []
  for (const id of await store.smembers(toSetKey(receiver))) {
    const rec = await store.get(giftKey(id))
    if (!rec) { await store.srem(toSetKey(receiver), id); continue }
    recs.push({ id, rec })
  }
  if (recs.length <= MAX_PER_RECEIVER) return
  recs.sort((a, b) => (a.rec.sentAt < b.rec.sentAt ? -1 : 1)) // oldest first
  for (const { id, rec } of recs.slice(0, recs.length - MAX_PER_RECEIVER)) await removeGift(store, id, rec)
}

// How many direct gifts the giver has sent today (UTC). Prunes stale index members.
async function sentToday(store, giver, today) {
  let n = 0
  for (const id of await store.smembers(bySetKey(giver))) {
    const rec = await store.get(giftKey(id))
    if (!rec) { await store.srem(bySetKey(giver), id); continue }
    if (utcDay(rec.sentAt) === today) n += 1
  }
  return n
}

// Create a direct gift (sent at once: there is no claimed state). Returns 'created', 'again' (idempotent: the same
// giftId by the same giver to the same receiver), 'conflict' (the giftId exists with a different giver/receiver), or
// 'limit' (over MAX_PER_DAY today).
export async function createDirectGift(store, { giftId, giver, receiver, brandKey, message = '', banner = '' }) {
  const existing = await store.get(giftKey(giftId))
  if (existing) return existing.giver === giver && existing.receiver === receiver ? 'again' : 'conflict'
  const sentAt = new Date().toISOString()
  if ((await sentToday(store, giver, utcDay(sentAt))) >= MAX_PER_DAY) return 'limit'
  const rec = { giver, receiver, brandKey, sentAt, thanked: false }
  if (message) rec.message = message
  if (banner) rec.banner = banner
  if (!(await store.setIfAbsent(giftKey(giftId), rec))) {
    const now = await store.get(giftKey(giftId))
    return now && now.giver === giver && now.receiver === receiver ? 'again' : 'conflict'
  }
  await store.sadd(toSetKey(receiver), giftId)
  await store.sadd(bySetKey(giver), giftId)
  await capReceiver(store, receiver)
  return 'created'
}

// The giver delivers (or resends) the sealed boxes on their own direct gift. Giver only. 'ok' | 'not_found' | 'opened'.
export async function deliverDirectBoxes(store, giftId, giver, boxes) {
  const rec = await store.get(giftKey(giftId))
  if (!rec || rec.giver !== giver) return 'not_found'
  const r = applyDeliver(rec, boxes)
  if (r !== 'ok') return r
  await store.set(giftKey(giftId), rec)
  return 'ok'
}

// The receiver opens the gift: delete every box and set openedAt once. Idempotent. 'ok' | 'not_found'.
export async function openDirectGift(store, giftId, receiver) {
  const rec = await store.get(giftKey(giftId))
  if (!rec || rec.receiver !== receiver) return 'not_found'
  applyOpen(rec)
  await store.set(giftKey(giftId), rec)
  return 'ok'
}

// The receiver says thanks. Idempotent. 'ok' | 'not_found'.
export async function thankDirect(store, giftId, receiver) {
  const rec = await store.get(giftKey(giftId))
  if (!rec || rec.receiver !== receiver) return 'not_found'
  if (!rec.thanked) { rec.thanked = true; await store.set(giftKey(giftId), rec) }
  return 'ok'
}

// The receiver's direct gifts, each with the single box for this device (encPub) only. Sorted by sentAt (oldest first).
// The giver's identity is added by the route. Prunes stale index members; persists a box expiry when it trips.
export async function directGiftsReceived(store, receiver, encPub) {
  const out = []
  for (const id of await store.smembers(toSetKey(receiver))) {
    const rec = await store.get(giftKey(id))
    if (!rec) { await store.srem(toSetKey(receiver), id); continue }
    const entry = { giftId: id, brandKey: rec.brandKey, by: rec.giver, thanked: Boolean(rec.thanked), sentAt: rec.sentAt }
    if (rec.message) entry.message = rec.message
    if (rec.banner) entry.banner = rec.banner
    if (rec.deliveredAt) {
      entry.delivered = true
      const { box, expired } = boxFor(rec, encPub)
      if (expired) { delete rec.boxes; await store.set(giftKey(id), rec) }
      else if (box) entry.box = box
    }
    out.push(entry)
  }
  out.sort((a, b) => (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0))
  return out
}

// The gifts a giver sent to one particular receiver, giver-only fields. [{ giftId, delivered?, openedAt?, thanked? }].
// Prunes stale index members.
export async function directSentTo(store, giver, receiver) {
  const out = []
  for (const id of await store.smembers(bySetKey(giver))) {
    const rec = await store.get(giftKey(id))
    if (!rec) { await store.srem(bySetKey(giver), id); continue }
    if (rec.receiver !== receiver) continue
    const entry = { giftId: id }
    if (rec.deliveredAt) entry.delivered = true
    if (rec.openedAt) entry.openedAt = rec.openedAt
    if (rec.thanked) entry.thanked = true
    out.push(entry)
  }
  return out
}

// Delete account: drop every direct gift where the user is giver or receiver, both indexes.
export async function dropDirectGiftsFor(store, id) {
  for (const gid of await store.smembers(toSetKey(id))) { const rec = await store.get(giftKey(gid)); await removeGift(store, gid, rec) }
  for (const gid of await store.smembers(bySetKey(id))) { const rec = await store.get(giftKey(gid)); await removeGift(store, gid, rec) }
  await store.del(toSetKey(id), bySetKey(id))
}

// Unfriend: strip the sealed boxes of direct gifts between the two (records stay, the relay just stops), both directions.
export async function stripDirectBoxesBetween(store, a, b) {
  for (const [giver, receiver] of [[a, b], [b, a]]) {
    for (const gid of await store.smembers(bySetKey(giver))) {
      const rec = await store.get(giftKey(gid))
      if (!rec || rec.receiver !== receiver) continue
      if (rec.boxes !== undefined) { delete rec.boxes; await store.set(giftKey(gid), rec) }
    }
  }
}
