// Gift claims: who called dibs on which brand of whose wishlist, whether it was marked as sent, whether thanks
// were said. A claim is keyed by (owner id, brand key) and holds { by: giver id, state: 'claimed' | 'sent',
// thanked: boolean }. NOTHING else is stored here: never a code, a PIN, a link, a card value, a NIM amount,
// a goal id, an email or a wallet address. The server learns three things only, and only those three live here.
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

// The giver marks a claim as sent (only from state 'claimed'). Idempotent: already sent by the same giver is 'sent'.
// Returns 'sent' or 'not_found'.
export async function markSent(store, owner, brand, giver) {
  const rec = await store.get(claimKey(owner, brand))
  if (!rec || rec.by !== giver) return 'not_found'
  if (rec.state === 'sent') return 'sent'
  if (rec.state !== 'claimed') return 'not_found'
  rec.state = 'sent'
  await store.set(claimKey(owner, brand), rec)
  return 'sent'
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

// The owner's received gifts (state 'sent' only): [{ brandKey, by, thanked }]. The giver's name/seed is added by
// the route (it loads the user). Never any claim in state 'claimed'.
export async function sentGifts(store, owner) {
  const claims = await ownerClaims(store, owner)
  return Object.entries(claims).filter(([, r]) => r.state === 'sent').map(([brandKey, r]) => ({ brandKey, by: r.by, thanked: Boolean(r.thanked) }))
}

// Unfriend: drop the claims in state 'claimed' between the two users, both directions. Sent gifts stay.
export async function dropClaimedBetween(store, a, b) {
  for (const [owner, giver] of [[a, b], [b, a]]) {
    for (const brand of await store.smembers(ownerSetKey(owner))) {
      const rec = await store.get(claimKey(owner, brand))
      if (rec && rec.by === giver && rec.state === 'claimed') await remove(store, owner, brand, giver)
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
