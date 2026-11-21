// Gift claims: who called dibs on which brand of whose wishlist, whether it was marked as sent, whether thanks
// were said. A claim is keyed by (owner id, brand key) and holds { by: giver id, state: 'claimed' | 'sent',
// thanked: boolean }, plus (only once sent, both optional) message: a short text the giver typed, and banner: one of
// four banner names. NOTHING else is stored here: never a code, a PIN, a link, a card value, a NIM amount, a goal id,
// an email or a wallet address. The message and the banner are shown only to the owner who received the gift
// (giftsReceived on GET /v1/me); no other route ever carries them.
//
// The surprise rule: the owner of a wish must never learn, from any response, that someone called dibs on it while
// the claim is still in state 'claimed'. So the owner's own views (GET /v1/me, /v1/me/as-friend) carry nothing about
// claims in state 'claimed'; only a giver viewing the owner (GET /v1/users/:id) sees the wish's status, and only
// from their own side (never who the other giver is). See wishesFor in rules.js.

export const MAX_OPEN_CLAIMS = 10 // open (state 'claimed') claims per giver

// Keys (all prefixed fr:). A claim record, plus two indexes so we can list an owner's claims and a giver's claims
// without scanning, and clean both up on unfriend and on delete.
const claimKey = (owner, brand) => `fr:claim:${owner}:${brand}`
const ownerSetKey = (owner) => `fr:oclaims:${owner}` // set of brand keys claimed on this owner's wishlist
const giverSetKey = (giver) => `fr:gclaims:${giver}` // set of "<owner>:<brand>" this giver has claimed
// Owner ids are base32 (no colon) and brand keys match ^[a-z0-9_-]{1,32}$ (no colon), so split on the first colon.
const member = (owner, brand) => `${owner}:${brand}`
const splitMember = (m) => { const i = m.indexOf(':'); return [m.slice(0, i), m.slice(i + 1)] }

export const getClaim = (store, owner, brand) => store.get(claimKey(owner, brand))

async function remove(store, owner, brand, giver) {
  await store.del(claimKey(owner, brand))
  await store.srem(ownerSetKey(owner), brand)
  await store.srem(giverSetKey(giver), member(owner, brand))
}

// How many open (state 'claimed') claims the giver holds. Prunes index members whose claim is gone.
export async function openClaimCount(store, giver) {
  let n = 0
  for (const m of await store.smembers(giverSetKey(giver))) {
    const [owner, brand] = splitMember(m)
    const rec = await store.get(claimKey(owner, brand))
    if (!rec || rec.by !== giver) { await store.srem(giverSetKey(giver), m); continue }
    if (rec.state === 'claimed') n += 1
  }
  return n
}

// Atomic "set if absent". Returns 'claimed' (new), 'again' (already this giver's, idempotent) or 'taken' (someone else).
export async function claim(store, owner, brand, giver) {
  const rec = { by: giver, state: 'claimed', thanked: false }
  if (await store.setIfAbsent(claimKey(owner, brand), rec)) {
    await store.sadd(ownerSetKey(owner), brand)
    await store.sadd(giverSetKey(giver), member(owner, brand))
    return 'claimed'
  }
  const existing = await store.get(claimKey(owner, brand))
  return existing && existing.by === giver ? 'again' : 'taken'
}

// The giver releases a claim in state 'claimed'. A sent gift cannot be released.
// Returns 'released', 'sent' (refused: already sent) or 'not_found'.
export async function release(store, owner, brand, giver) {
  const rec = await store.get(claimKey(owner, brand))
  if (!rec || rec.by !== giver) return 'not_found'
  if (rec.state !== 'claimed') return 'sent'
  await remove(store, owner, brand, giver)
  return 'released'
}

// Writes the optional gift message and banner onto a record (only non-empty values; the first write wins).
function applyGiftExtra(rec, extra) {
  if (extra?.message) rec.message = extra.message
  if (extra?.banner) rec.banner = extra.banner
}

// The giver marks a claim as sent (only from state 'claimed'). Idempotent: already sent by the same giver is 'sent'.
// `extra` is the optional { message, banner } the giver typed; it is stored when the call moves the claim to sent, or on
// the idempotent repeat by the same giver while nothing is stored yet (so a retry that carries the text still lands).
// Returns 'sent' or 'not_found'.
export async function markSent(store, owner, brand, giver, extra = {}) {
  const rec = await store.get(claimKey(owner, brand))
  if (!rec || rec.by !== giver) return 'not_found'
  if (rec.state === 'sent') {
    if (!rec.message && !rec.banner && (extra.message || extra.banner)) { applyGiftExtra(rec, extra); await store.set(claimKey(owner, brand), rec) }
    return 'sent'
  }
  if (rec.state !== 'claimed') return 'not_found'
  rec.state = 'sent'
  applyGiftExtra(rec, extra)
  await store.set(claimKey(owner, brand), rec)
  return 'sent'
}

// The owner removed a wish (a brand left shared.wishlist): drop the message, banner and any sealed boxes from its sent
// claim, keeping the claim itself (the gift is still on its way). Quiet no-op when there is nothing to drop.
export async function stripGiftExtra(store, owner, brand) {
  const rec = await store.get(claimKey(owner, brand))
  if (!rec || (rec.message === undefined && rec.banner === undefined && rec.boxes === undefined)) return
  delete rec.message
  delete rec.banner
  delete rec.boxes
  await store.set(claimKey(owner, brand), rec)
}

// ---- gift box delivery (v1.7.3) -----------------------------------------------------------------------------------
// The giver delivers a gift card code to the owner end to end encrypted: a set of sealed boxes (one per owner device),
// which the server relays but cannot read. A box is { to, eph, iv, ct } base64url; the plaintext is only ever the
// owner's to open. Stored on the sent claim as `boxes`, with `deliveredAt`; `openedAt` once the owner opens it.
export const BOX_TTL_MS = 30 * 24 * 60 * 60 * 1000 // boxes are relayed, not kept: dropped 30 days after delivery
export const boxesExpired = (rec) => Boolean(rec.deliveredAt) && (Date.now() - Date.parse(rec.deliveredAt) > BOX_TTL_MS)

// Pure record mutators, shared by wishlist claims and direct gifts (v1.7.4 directGifts.js) so the relay rules live once.
// applyDeliver: set/replace the boxes and deliveredAt; refused once opened. Returns 'ok' | 'opened'. The caller persists.
export function applyDeliver(rec, boxes) {
  if (rec.openedAt) return 'opened'
  rec.boxes = boxes
  rec.deliveredAt = new Date().toISOString()
  return 'ok'
}
// applyOpen: delete every box (the relay is done) and set openedAt once. The caller persists.
export function applyOpen(rec) {
  if (rec.boxes !== undefined) delete rec.boxes
  if (!rec.openedAt) rec.openedAt = new Date().toISOString()
}
// boxFor: the single box addressed to `encPub`, honouring the 30-day TTL. Pure: returns { box, expired }; the caller
// deletes and persists the boxes when `expired`.
export function boxFor(rec, encPub) {
  if (!rec?.boxes || !rec.deliveredAt) return { box: undefined, expired: false }
  if (boxesExpired(rec)) return { box: undefined, expired: true }
  if (!encPub) return { box: undefined, expired: false }
  return { box: (rec.boxes || []).find((b) => b && b.to === encPub) || undefined, expired: false }
}

// The giver delivers (or resends) the sealed boxes on their own sent claim. Replaces any previous boxes (a resend) and
// updates deliveredAt. Refused once the owner has opened it. Returns 'ok' | 'not_found' | 'not_sent' | 'opened'.
export async function deliverBoxes(store, owner, brand, giver, boxes) {
  const rec = await store.get(claimKey(owner, brand))
  if (!rec || rec.by !== giver) return 'not_found'
  if (rec.state !== 'sent') return 'not_sent'
  const r = applyDeliver(rec, boxes)
  if (r !== 'ok') return r
  await store.set(claimKey(owner, brand), rec)
  return 'ok'
}

// The owner opens the gift: delete every box (the relay is done) and set openedAt once. Idempotent. Returns 'ok' or
// 'not_found' (no sent gift for this brand).
export async function openGift(store, owner, brand) {
  const rec = await store.get(claimKey(owner, brand))
  if (!rec || rec.state !== 'sent') return 'not_found'
  applyOpen(rec)
  await store.set(claimKey(owner, brand), rec)
  return 'ok'
}

// The single box addressed to this device's encryption key on a sent claim, honouring the 30-day TTL (an expired set is
// deleted and persisted, then none is returned). `rec` is the claim record. Returns the box or undefined.
export async function ownerBox(store, owner, brand, rec, encPub) {
  const { box, expired } = boxFor(rec, encPub)
  if (expired) { delete rec.boxes; await store.set(claimKey(owner, brand), rec); return undefined }
  return box
}

// The owner's received gifts (state 'sent' only), with delivery for this device: [{ brandKey, by, thanked, message?,
// banner?, delivered?, box? }]. `box` is the single box for `encPub` (this device), never any other device's box. The
// giver's name/seed is added by the route (it loads the user). Never any claim in state 'claimed'.
export async function receivedGifts(store, owner, encPub) {
  const claims = await ownerClaims(store, owner)
  const out = []
  for (const [brandKey, r] of Object.entries(claims)) {
    if (r.state !== 'sent') continue
    const entry = { brandKey, by: r.by, thanked: Boolean(r.thanked) }
    if (r.message) entry.message = r.message
    if (r.banner) entry.banner = r.banner
    if (r.deliveredAt) {
      entry.delivered = true
      const box = await ownerBox(store, owner, brandKey, r, encPub)
      if (box) entry.box = box
    }
    out.push(entry)
  }
  return out
}

// The owner says thanks (only when the gift is in state 'sent'). Idempotent. Returns 'ok' or 'not_found'.
export async function thank(store, owner, brand) {
  const rec = await store.get(claimKey(owner, brand))
  if (!rec || rec.state !== 'sent') return 'not_found'
  if (!rec.thanked) { rec.thanked = true; await store.set(claimKey(owner, brand), rec) }
  return 'ok'
}

// Every claim on the owner's wishlist, as { [brandKey]: rec }. Prunes index members whose claim is gone.
export async function ownerClaims(store, owner) {
  const out = {}
  for (const brand of await store.smembers(ownerSetKey(owner))) {
    const rec = await store.get(claimKey(owner, brand))
    if (rec) out[brand] = rec; else await store.srem(ownerSetKey(owner), brand)
  }
  return out
}

// Unfriend: drop the claims in state 'claimed' between the two users, both directions. A sent gift stays, but its sealed
// boxes are stripped (the two are no longer friends, so the relay stops; the claim and its history remain).
export async function dropClaimedBetween(store, a, b) {
  for (const [owner, giver] of [[a, b], [b, a]]) {
    for (const brand of await store.smembers(ownerSetKey(owner))) {
      const rec = await store.get(claimKey(owner, brand))
      if (!rec || rec.by !== giver) continue
      if (rec.state === 'claimed') { await remove(store, owner, brand, giver); continue }
      if (rec.boxes !== undefined) { delete rec.boxes; await store.set(claimKey(owner, brand), rec) }
    }
  }
}

// Delete account: drop every claim and gift where the user is the owner or the giver.
export async function dropAllFor(store, id) {
  for (const brand of await store.smembers(ownerSetKey(id))) {
    const rec = await store.get(claimKey(id, brand))
    if (rec) await store.srem(giverSetKey(rec.by), member(id, brand))
    await store.del(claimKey(id, brand))
  }
  await store.del(ownerSetKey(id))
  for (const m of await store.smembers(giverSetKey(id))) {
    const [owner, brand] = splitMember(m)
    const rec = await store.get(claimKey(owner, brand))
    if (rec && rec.by === id) { await store.del(claimKey(owner, brand)); await store.srem(ownerSetKey(owner), brand) }
  }
  await store.del(giverSetKey(id))
}
