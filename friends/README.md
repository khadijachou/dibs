# Dibs Friends server

A small standalone service (Hono on Node 22) for the Friends feature of Dibs. It holds who is friends with
whom, friend codes, invites, and each person's choice of what to share. Seven items, each off by default:
**avatar, level, badges, totals (saved and earned), goals, cards, wishlist** (v1.4.2 added avatar and totals).
It is separate from `server/` (the shop/stats server) and from `app/`; it imports nothing from them.

It is built around one privacy rule: **a user is identified by their wallet, but the wallet is never stored
in a readable form.** At register time the phone proves it holds the wallet with a Nimiq signature; the server
derives a Nimiq address from the signing key, then keeps only `walletKey = HMAC-SHA256(address, FRIENDS_SALT)`.
The address and the wallet public key are never stored or returned.

The service never stores or returns: a wallet address in clear, a wallet balance, a wallet public key, a gift card
code, a PIN, an email, a transaction hash, a deposit, a date, or an IP address. NIM amounts are stored only when the
user turns on **totals**, **goals** or **cards** (saved/earned, and the face value of goals and cards); they are
never read from the chain here, the phone sends them. Log lines hold a route, a status and a duration only. For
another user the avatar is the data URL that user chose to share (v1.4.2, drawn on their phone); if they do not
share it, none is sent and the app draws a letter avatar from their name.

## Identity model

- The phone makes an **Ed25519 device key pair** once. The private key never leaves the phone.
- `POST /v1/register` links a device key to a wallet, proven by a wallet signature (see below). The first time
  it creates a user: a random 128-bit `id` (static forever, also the avatar seed) and a `DIBS-XXXX` friend code.
  A second phone that signs with the same wallet is **restored** onto the same account (same id, code, friends,
  choices); its device key is added (up to 5 devices, oldest dropped). The name is not overwritten on restore.
- Every other route is signed by the device key (see "Device signature").

## Routes

All under `/v1`. Every error is `{ "error": CODE }` (e.g. `NOT_FOUND`, `BAD_CODE`, `UNAUTHORIZED`, `LIMIT`).
Codes are data for the app to translate, never user-facing sentences.

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/health` | none | `{ ok, store: "upstash"\|"memory", version }` |
| `POST /v1/register` | wallet sig in body | create or restore a user → `{ restored, id, code, name, visibility, look }` |
| `GET /v1/me` | device | my own full profile + `code` |
| `GET /v1/me/as-friend` | device | what a friend sees of me |
| `PATCH /v1/me` | device | update `name?`, `visibility?`, `look?` → my identity |
| `PUT /v1/me/shared` | device | upload shared data (off items dropped) → the kept data |
| `DELETE /v1/me` | device | delete my account and all my data on both sides |
| `GET /v1/lookup?code=DIBS-XXXX` | device | `{ id, name, seed, level?, rank? }`; 404 `BAD_CODE`, 400 `OWN_CODE` |
| `POST /v1/invites` | device | invite by `{ code }`; mutual pending → friends; 409 `ALREADY_FRIENDS` |
| `GET /v1/friends` | device | `{ invites, sent, friends }` |
| `POST /v1/invites/:id/accept` | device (receiver) | accept → friends |
| `DELETE /v1/invites/:id` | device | receiver declines or sender cancels (silent) |
| `DELETE /v1/friends/:id` | device | remove a friendship (silent on both sides) |
| `GET /v1/users/:id` | device | that user's profile as I may see it (self / friend / stranger) |
| `POST /v1/users/:id/wishes/:brandKey/claim` | device | call dibs on a friend's wish; `409 TAKEN`, `429 LIMIT`, else `404` |
| `DELETE /v1/users/:id/wishes/:brandKey/claim` | device (giver) | release a claim in state claimed; `409 SENT` on a sent gift |
| `POST /v1/users/:id/wishes/:brandKey/sent` | device (giver) | mark a claim as sent (from state claimed) |
| `POST /v1/me/gifts/:brandKey/thanks` | device (owner) | say thanks for a gift in state sent (idempotent) |

### Gifts: call dibs on a friend's wish (v1.4.3)

A giver can call dibs on a brand on a friend's wishlist. They then save for that card **in their own account**, buy it
exactly as any other card, and send the code to their friend with their phone's share sheet. The server never touches
the money path and **never receives or stores a code, a PIN, a redemption link, a card value, a NIM amount, a goal id,
an email or a wallet address**. It holds three facts only: **who called dibs on which brand of whose wishlist**, whether
it was **marked as sent**, and whether **thanks** were said.

A claim is keyed by `(owner id, brand key)` and holds `{ by: giver id, state: 'claimed' | 'sent', thanked }`.

- **Claim** is allowed only when the caller and the owner are friends, the owner shares the wishlist (friends or
  everyone), and the brand is on it. Any of the three failing gives the same `404 NOT_FOUND`, so nothing leaks. The
  claim is atomic ("set if absent"): a wish already claimed by someone else is `409 TAKEN`; by the caller again it is
  `200`. A giver may hold at most **10 open (state claimed) claims**; beyond that it is `429 LIMIT`.
- **Release** (DELETE) lets the giver free a claim in state claimed. A sent gift cannot be released (`409 SENT`).
- **Sent** moves a claim from claimed to sent (giver only).
- **Thanks** sets `thanked` true on a gift in state sent (owner only); idempotent.

**What each viewer receives:**

- A **friend** viewing the owner (`GET /v1/users/:id`) gets, next to the unchanged `wishlist` array (old phones keep
  working), a `wishes: { [brandKey]: { status, thanked? } }` object for the brands on the **visible** wishlist that have
  a claim. `status` is from that viewer's own side: `mine` (I called dibs), `mine_sent` (I marked it sent, with
  `thanked: true` once the owner thanked), `taken` (another friend called dibs) or `gifted` (another friend marked it
  sent). It never says who the other giver is. A brand with no claim has no entry.
- The **owner** (`GET /v1/me`, `GET /v1/me/as-friend`) gets **nothing about claims in state claimed** — so the surprise
  holds. `GET /v1/me` gains `gifts: [{ brandKey, from: { id, name, seed }, thanked }]` for claims in **state sent only**.
- A **stranger** gets nothing new.

**Cleanup:** removing a friendship drops the claims in state claimed between the two (both directions); sent gifts stay.
Deleting an account drops every claim and gift where the user is giver or owner. If the owner removes the brand from the
wishlist or turns the wishlist off, the claim is kept but hidden (`wishes` lists visible brands only); a sent gift still
shows in the owner's `gifts`.

### Request and response shapes

- `POST /v1/register` body: `{ name, devicePub, wallet: { message, publicKey, signature } }`.
  `name` 1–24 chars after trimming (control chars, line breaks, `<` and `>` removed). `devicePub` 64 hex.
- `PATCH /v1/me` body: `{ name?, visibility?: { avatar?, level?, badges?, totals?, goals?, cards?, wishlist? }, look?: { accent?, frame? } }`.
  Each visibility is `off | friends | everyone` (all off by default). `accent`/`frame` match `^[a-z0-9_-]{1,16}$`.
  Turning an item off deletes its stored data at once.
- `PUT /v1/me/shared` body (each field stored only when its visibility is not `off`):
  - `level?: { level, rank }` — `level` 1–999, `rank` matches `^[a-z0-9_-]{1,32}$`.
  - `badges?`, `wishlist?` — arrays of brand/badge keys (`^[a-z0-9_-]{1,32}$`), at most 60 each.
  - `goals?: [{ brandKey, pct, value? }]` — `pct` 0–100, at most 12; `value` optional (see below).
  - `cards?` — at most 60 entries, each a brand-key string (old phones) **or** `{ brandKey, value? }`; stored and
    returned as objects `{ brandKey, value? }`. Duplicates are allowed (two Steam 20 USD cards are two cards).
  - `totals?: { saved, earned? }` — whole NIM integers, 0 to 999,999,999,999; `saved` required, `earned` optional;
    any other key in the object is dropped.
  - `avatar?` — a string that starts with exactly `data:image/svg+xml;base64,` or `data:image/png;base64,`, whose
    remainder is valid base64, total length at most 12,288 characters. Stored and returned as-is.
  - `value` (on a goal or a card) — a string of 1–24 chars matching `^[\p{L}\p{N} .,'-]+$/u` ("20 USD", "25 EUR").
  - A field that is **present but malformed** returns `400 BAD_REQUEST` and **nothing** from that request is stored,
    for `totals`, `avatar`, and a `value` when present. The old fields in their old shapes keep dropping bad entries
    silently. No dates, no goal names, no wallet balance.
- Visibility of shared items to a viewer: a **friend** sees items set to `friends` or `everyone`, plus
  `hidden: [names of items kept off]` (names only, never the data) — **except avatar**, which is never a hidden line.
  A **stranger** sees only `{ id, name, seed }` (no avatar, no totals). **Self** sees everything plus the
  `visibility` map.
- `GET /v1/friends` → `{ invites: [{ id, from: { id, name, seed } }], sent: [{ id, to: { id, name, seed } }],
  friends: [{ id, name, seed, since, level?, rank?, avatar?, look?, sharesNothing }] }`. A friend row carries the
  `avatar` data URL when that friend shares it, for at most the first 50 friends; beyond 50 the rows carry no avatar.
  Invites, sent rows and `GET /v1/lookup` never carry an avatar (they are strangers). No totals on any row.

### Limits

Lookup 10/min and 100/day per user (to slow code guessing). 200 friends, 50 pending invites received, 50 sent
(`429 LIMIT` beyond). 120 requests/min per user id; 10 registers/min per IP (the IP is used in memory only and
never stored). Request body capped at 16 KB, except `PUT /v1/me/shared` at 32 KB (an avatar plus the rest).

## The two signatures

### Wallet signature (Nimiq Pay), used once at register

Nimiq Pay signs with **Ed25519 over `sha256( 0x16 ++ "Nimiq Signed Message:\n" ++ ascii(byteLength) ++ messageBytes )`**,
where `messageBytes` are the UTF-8 bytes of the text and `byteLength` is their count written in decimal. The byte
`0x16` (22) is the length of the prefix string. `publicKey` is 64 hex chars, `signature` 128 hex chars, lowercase.

The register `message` must be exactly (three lines):

```
Dibs Friends: link this wallet
Device: <devicePub hex>
Time: <ISO 8601 UTC>
```

The server checks: the signature verifies; the `Device:` line equals `devicePub`; `Time` is within 10 minutes of
now. It then computes `address = addressOf(publicKey)` (blake2b-256 of the key, first 20 bytes, Nimiq base32 with
`NQ` + IBAN check digits) and `walletKey = HMAC-SHA256(address, FRIENDS_SALT)`, the only stored form of the wallet.

Worked example (keys generated for this README; throwaway, they control nothing):

```
devicePub = fd1724385aa0c75b64fb78cd602fa1d991fdebf76b13c58ed702eac835e9f618
walletPub = ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c
address   = NQ27HLNHQ9G14Y3L8VMJE4TCBQUC00VNDE49   (never stored; only its walletKey is)
message   = "Dibs Friends: link this wallet\nDevice: fd17...f618\nTime: 2026-11-21T12:00:00.000Z"
signature = 8ddb4ae029d2aa98c29ffee9a5f35bafab5e022f91b09855b192d8129aa587a2e40601549b26cc3b925066878eb5ed2971ffe802b525e9ec74aacf33f09ada0b
```

### Device signature, used on every other route

The phone signs a canonical string with the **device private key (plain Ed25519, no prefix)** and sends:

- `X-Dibs-Id`: the user id
- `X-Dibs-Ts`: current time in milliseconds
- `X-Dibs-Nonce`: fresh random hex, 16+ chars
- `X-Dibs-Sig`: `Ed25519(devicePriv, canonical)` as 128 hex chars, where

```
canonical = method + "\n" + pathWithQuery + "\n" + ts + "\n" + nonce + "\n" + sha256hex(body or "")
```

The server checks: `ts` within 5 minutes; the nonce was not seen for that id in the last 10 minutes (stored with
an expiry); the signature verifies against one of the user's device keys. Any failure is `401 UNAUTHORIZED` with
no detail.

Worked example (device key above, `GET /v1/me`, empty body):

```
bodyHash  = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855   (sha256 of "")
canonical = "GET\n/v1/me\n1763726400000\na1b2c3d4e5f60718\ne3b0...b855"
X-Dibs-Sig= 7e13e7b804b8adaf6dc02cb3b59dba573d3929c86414d59a3f56c6fe279561e85cd4011247810f7e986a0cbe14b3061957be8573ecde98edcdc88f2c1c7da90d
```

## What is stored / never stored

Stored (keys prefixed `fr:`): the user record (`id`, `code`, `name`, device public keys, visibility map, `look`,
and `walletKey`), the shared data for on items (which from v1.4.2 may include an avatar image the user shared, their
saved/earned NIM totals, and the face value of goals and cards), friendships with a `since`, invites, the code→id
and walletKey→id links, short-lived nonces, and (v1.4.3) gift claims — `(owner id, brand key) -> { by, state, thanked }`
and nothing else. **Never stored, whatever the settings:** a wallet address in clear,
a wallet balance, a wallet public key, a gift card code, a PIN, an email, a transaction hash, a deposit, or an IP
address. NIM amounts are stored only when the user turns on totals, goals or cards; before v1.4.2 they were never
stored at all.

## Environment variables

Names only (set the values in Render, never in the repo or in chat):

- `PORT` — port to listen on.
- `ALLOWED_ORIGINS` — comma-separated HTTPS origins for CORS on `/v1/*` (the app's address). Empty: open in
  development, closed in production.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — this service's OWN Upstash database. Both set → Upstash;
  otherwise an in-memory store (data not kept; a warning prints at start).
- `FRIENDS_SALT` — secret for `walletKey`. Required in production (the server refuses to start without it).
- `NODE_ENV` — `production` or `development`.

## Run it locally

```
cd friends
npm ci
npm start        # no env: in-memory store, http://localhost:8788
npm test         # node --test, no network (the Hono app is driven with app.request)
```

## Deploy on Render

Create a **new Web Service** from this same repo:

- Root directory: `friends`
- Build command: `npm ci`
- Start command: `npm start`
- A **new Upstash Redis database** for this service (do not reuse the stats one); set its REST URL and token.
- `FRIENDS_SALT`: make it with a password manager and **never rotate it** (rotating unlinks every wallet).
- `ALLOWED_ORIGINS`: the app's address.
- `NODE_ENV`: `production`.

All keys are typed in Render's dashboard only, never in chat or in the repo.
