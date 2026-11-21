# Security

Dibs never holds user funds. Every movement of money starts in Nimiq Pay and needs the user's confirmation in the native dialog. This file is the short threat model; Mohamed Aziz reviews it before submission.

## What we protect

| Asset | Where it lives | Who can move it |
| --- | --- | --- |
| The user's NIM | The user's own Nimiq address and staker | Only the user, through Nimiq Pay confirmations |
| Gift card codes | Shown in the app, kept on the device; when sent to a friend in Dibs, relayed by the Friends server only encrypted end to end | The user (and, for a gift, the friend's phone that can decrypt it) |
| Bitrefill client credentials and invoice access tokens | Server `.env` and `server/data/invoices.json`, both git-ignored | The server only |
| Goal records | Device storage (week 1), server later | The user's address |

## Threats and what we do

| Threat | Mitigation |
| --- | --- |
| A bug or attacker makes the app send NIM somewhere else | The app only calls staking methods on the user's own staker and pays invoices that our server or the user provides; every call shows the amount and destination in the Nimiq Pay dialog |
| A tampered invoice (higher amount, other recipient) | The app checks the invoice amount against the item price before paying and shows both; fixed-amount invoices only (the SDK refuses others) |
| Paying the same invoice twice | The SDK rejects reuse with `DUPLICATE_PAYMENT`; on `TRANSACTION_OUTCOME_UNKNOWN` the app stops and never retries that invoice |
| Credential leak | Client id and secret only in `server/.env`; invoice access tokens (which can read codes) never leave the server; the browser only ever sees the invoice id |
| Abuse of the redeem endpoint | Rate limit per IP; orders are created only for catalogue items |
| Codes stolen from our server | The orders server does not store codes; it passes them through once. The Friends server may relay a gift card code to a friend, but only encrypted end to end: it never holds a readable code (see below) |
| A failed order after payment | The order id and the provider's support path are shown; the user is warned before paying that refunds go through the provider |

## Sending a gift card code to a friend, end to end encrypted (v1.7.3)

The amended rule (21 Nov): the Friends server may relay a gift card code only encrypted end to end, never readable by the server. Everything else stands: the orders server never stores a code, stats never see one, no log prints a request body, no code is in git or in a test fixture.

The design, in five lines:
1. Each phone creates an X25519 key pair; the private key stays on the phone (`dibs.friends.enc`), only the public key is registered with the Friends server.
2. To send a code, the giver fetches the receiver's public key(s), derives a shared secret (X25519), expands it with HKDF-SHA256, and encrypts `{ code, pin, link }` with AES-256-GCM, bound to `ownerId:brandKey:giverId` as additional data.
3. The giver delivers one sealed box per receiver device; the server stores and relays the boxes but cannot derive the key, so it never reads the code.
4. The receiver's phone opens its box with its private key, keeps the code locally, and tells the server, which deletes every box. Boxes also expire 30 days after delivery, and on unfriend, profile delete, or the wish leaving the list.
5. The share sheet stays as a fallback for a friend whose phone has no key yet.

Accepted limit: the Friends server hands out the public keys, so a server that was fully compromised could serve an attacker's key in place of the receiver's and read a code delivered afterwards. There is no out-of-band key verification; we accept this because we run the server, and because the fallback share sheet carries the same trust. A compromised server still cannot read any code already delivered, and never sees a code sent outside Dibs.

## Open items before submission

- [ ] Login challenge (signed nonce) once goals move to the server
- [ ] Invoice amount check against live price, with a tolerance
- [ ] Review of every place a transaction is built
- [ ] Dependency audit (`npm audit`) on app and server

## Reporting

Found a problem? Open a private security advisory on this repository.
