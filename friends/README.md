# Dibs Friends server

A small standalone service (Hono on Node 22) for the Friends feature of Dibs. It holds who is friends with
whom, friend codes, invites, and each person's choice of what to share (level, badges, cards, goals, wishlist).
It is separate from `server/` (the shop/stats server) and from `app/`; it imports nothing from them.

It is built around one privacy rule: **a user is identified by their wallet, but the wallet is never stored
in a readable form.** At register time the phone proves it holds the wallet with a Nimiq signature; the server
derives a Nimiq address from the signing key, then keeps only `walletKey = HMAC-SHA256(address, FRIENDS_SALT)`.
The address and the wallet public key are never stored or returned.

The service never stores or returns: a wallet address in clear, a wallet public key, a gift card code, a PIN,
an email, a NIM amount, a transaction hash, or an IP address. Log lines hold a route, a status and a duration
only. The avatar for another user is drawn from their random user id (the `seed` field), never from their wallet.

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

### Request and response shapes

- `POST /v1/register` body: `{ name, devicePub, wallet: { message, publicKey, signature } }`.
  `name` 1–24 chars after trimming (control chars, line breaks, `<` and `>` removed). `devicePub` 64 hex.
- `PATCH /v1/me` body: `{ name?, visibility?: { level?, badges?, cards?, goals?, wishlist? }, look?: { accent?, frame? } }`.
  Each visibility is `off | friends | everyone` (all off by default). `accent`/`frame` match `^[a-z0-9_-]{1,16}$`.
- `PUT /v1/me/shared` body: `{ level?: { level, rank }, badges?: [id], cards?: [brandKey], goals?: [{ brandKey, pct }], wishlist?: [brandKey] }`.
  An item is kept only if its visibility is not `off`; anything sent for an `off` item is dropped. `level` 1–999,
  `rank`/ids/brand keys match `^[a-z0-9_-]{1,32}$`, `pct` an integer 0–100. At most 60 badges, 60 cards, 12 goals,
  60 wishlist entries. No amounts, no dates, no goal names.
- Visibility of shared items to a viewer: a **friend** sees items set to `friends` or `everyone`, plus
  `hidden: [names of items kept off]` (names only, never the data). A **stranger** sees only `{ id, name, seed }`
  (`everyone` is stored for leaderboards later but not served to strangers in v1.4.0). **Self** sees everything
  plus the `visibility` map.
- `GET /v1/friends` → `{ invites: [{ id, from: { id, name, seed } }], sent: [{ id, to: { id, name, seed } }],
  friends: [{ id, name, seed, since, level?, rank?, look?, sharesNothing }] }`.

### Limits

Lookup 10/min and 100/day per user (to slow code guessing). 200 friends, 50 pending invites received, 50 sent
(`429 LIMIT` beyond). 120 requests/min per user id; 10 registers/min per IP (the IP is used in memory only and
never stored). Request body capped at 16 KB.

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
and `walletKey`), the shared data for on items, friendships with a `since`, invites, the code→id and
walletKey→id links, and short-lived nonces. **Never stored:** a wallet address in clear, a wallet public key, a
gift card code, a PIN, an email, a NIM amount, a transaction hash, or an IP address.

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
