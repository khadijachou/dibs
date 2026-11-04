# Security

Dibs never holds user funds. Every movement of money starts in Nimiq Pay and needs the user's confirmation in the native dialog. This file is the short threat model; Mohamed Aziz reviews it before submission.

## What we protect

| Asset | Where it lives | Who can move it |
| --- | --- | --- |
| The user's NIM | The user's own Nimiq address and staker | Only the user, through Nimiq Pay confirmations |
| Gift card codes | Shown in the app, kept on the device | The user |
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
| Codes stolen from our server | The server does not store codes; it passes them through once |
| A failed order after payment | The order id and the provider's support path are shown; the user is warned before paying that refunds go through the provider |

## Open items before submission

- [ ] Login challenge (signed nonce) once goals move to the server
- [ ] Invoice amount check against live price, with a tolerance
- [ ] Review of every place a transaction is built
- [ ] Dependency audit (`npm audit`) on app and server

## Reporting

Found a problem? Open a private security advisory on this repository.
