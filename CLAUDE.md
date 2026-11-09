# Dibs: notes for Claude Code

Dibs is a Nimiq Pay mini app (category Save): pick a real gift card, save NIM toward it, the NIM is staked from the user's own account while they wait, and at 100% the user gets the card with one tap (unstake, then pay the shop's Lightning invoice with `payLightningInvoice`). No custody, no fiat, no smart contract. Tagline: "Call dibs. Save up. It's yours."

## Layout and commands

| Folder | What | Run |
| --- | --- | --- |
| `app/` | Vite 8 + React 19 + `@nimiq/mini-app-sdk` 0.2.4 | `cd app && npm install && npm run dev` (port 5173, proxies `/api` to 8787) |
| `server/` | Node 22 + Hono: catalogue with live prices, Lightning invoices, order status | `cd server && npm install && npm run dev` (port 8787) |
| `server/catalog.json` | What Dibs sells | `npm run catalog -- search <brand> [COUNTRY] \| show <slug> \| add <slug> <amounts> "<name>" \| list \| remove <id>` |

Build check before every commit: `cd app && npx vite build`.

Env (never commit real values; `.env` files and `server/data/` are git-ignored):
- `app/.env`: `VITE_API_URL` (server URL, no trailing slash), `VITE_REDEEM_MODE=api`, `VITE_DEFAULT_VALIDATOR` (Garuda Pool `NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7`), `VITE_NIMIQ_RPC_URL=https://rpc.nimiqwatch.com`, `VITE_FALLBACK_NIM_USD`.
- `server/.env`: `BITREFILL_CLIENT_ID`, `BITREFILL_CLIENT_SECRET`, `ALLOWED_ORIGINS` (the app's HTTPS origin), `PORT`.

## Where things are (app/src)

- `lib/nimiq.js`: the only place that talks to Nimiq Pay. `connect()` (falls back to the demo wallet outside Nimiq Pay), `listAccountsWithBalance`, `getBalanceNim` (waits for consensus), `readStaker` (strict) / `getStaker` (never throws), `stakeNim`, `unlock.deactivate/retire/remove`, `payInvoice`.
- `lib/deposit.js`: one-tap deposit with a pending lock (`dibs:pending` in localStorage) and chain confirmation.
- `lib/goals.js`: goal ledger in localStorage (`dibs.goals.<address>`), `adoptGoals` merges goals saved under any address on the device.
- `lib/errors.js`: `classify(err, ctx)` → ErrorKey, Lab log (last 50), `?sim=KEY` demo simulator.
- `lib/i18n.js`: en / fr / es, flat keys, same keys and `{placeholders}` in all three.
- `lib/brands.js`, `lib/catalog.js`: brand tiles over the server catalogue (fallback list when the server is down).
- `screens/`: Home (Welcome + hub), Catalog, Plan, Goal, Unlock, Redeem, Done, Lab (`#lab`, developer checks).
- `components/ui.jsx`: Header, Ring, WeekDots, BrandLogo, Notice (tones info / wait / stop / ok), FieldError.

## Nimiq facts learned on mainnet (do not relearn them the hard way)

- `listAccounts` returns two addresses: the wallet/staker address and an HTLC address holding the spendable NIM. **Nimiq Pay replaces the HTLC address from time to time** (after receiving NIM, after Remove, sometimes for no visible reason). Never key goals, locks or anything else by the funded address.
- Staking transactions are paid from the funded (HTLC) address, but **the staker belongs to the wallet address**. Always read the staker on every shared address (`readStaker` does this and sums the balances).
- RPC `getStakerByAddress` needs the user-friendly address **with spaces** (without spaces: "Unknown format"). "No staker" comes back as an RPC error "No staker with address: …"; any other error means the chain could not be read: pause, never guess. Fields: `balance` (active), `inactiveBalance`, `inactiveFrom`, `retiredBalance`, `delegation`. The SDK calls the RPC URL directly from the browser, so `VITE_NIMIQ_RPC_URL` must be set.
- First deposit = `sendNewStakerTransaction` (min 100 NIM); later deposits = `sendStakeTransaction`. Decide from the chain, never from local state: a new-staker tx on an existing staker returns a hash but fails on chain (fee 0).
- Unlock order: `sendSetActiveStakeTransaction` (lower the active stake; starts the wait) → release at the next epoch boundary after `inactiveFrom` (+ 43,200 + 1 blocks; measured 12 h 4 min) → `sendRetireStakeTransaction` (≤ inactive balance) → `sendRemoveStakeTransaction` (must take the whole retired balance). Active + inactive must stay 0 or ≥ 100 NIM. Retire before the release is refused.
- `getBalance` excludes staked NIM. Before consensus it can answer 0: wait for `isConsensusEstablished`.
- `payLightningInvoice({ invoice })`: fixed-amount BOLT11 only, the user picks NIM or USDT. Errors: `PERMISSION_DENIED` (cancelled), `DUPLICATE_PAYMENT` (already paid: treat as paid), `TRANSACTION_OUTCOME_UNKNOWN` (**never pay again**; lock paying and poll the order).
- A second Nimiq Pay request while one is pending fails with "A transaction is still pending".

## Shop (Bitrefill MCP)

Server only (`server/src/mcp.js`, `server/src/bitrefill.js`). Client credentials from dynamic registration (`POST https://api.bitrefill.com/oauth/mcp/register`), 6 h bearer renewed automatically. Tools: `search-products` (needs `intent`), `get-product-details` (compact text), `buy-products` (lightning, `return_payment_link: false`, email required), `get-invoice-by-id` (needs the invoice access token, which never leaves the server). Statuses seen: `created` → `complete`; the code is found by a recursive search (code, pin, link…). No-account limits for the whole app: 15 cards + 2 top-ups a day, 500 USD a day, 1,000 USD a month. Bitrefill is named in the FAQ only (More > FAQ); everywhere else the UI says "the shop".

## Rules for code and copy

- Every money call goes through Nimiq Pay's own confirmation. Never retry a money call automatically.
- The chain (staker) and the shop (`/api/orders/:id`) are the truth; localStorage only keeps pointers.
- Block bad input before Nimiq Pay opens (E2 first deposit < 100 NIM, E3 above balance: one message, button disabled).
- Every error notice says what happened, whether NIM moved, what to do. Tones: info white, wait white + spinner, stop red (money attention), ok mint. Coral is never an error colour.
- Copy: plain words, no em dashes, no exclamation marks except "Dibs!". en is the source; every new key goes to fr (Quebec: vous, courriel, carte-cadeau) and es (neutral, tú) with the same key.
- Brand: coral `#E8482A` (action, progress), ink `#23212B`, cream `#FFF6EC`, mint `#15896A`, butter `#FFC94D` (on ink or coral only), red `#B42318`; Poppins 600/700, Inter 400 to 600.
- Test every change in demo mode (desktop browser) with `?sim=KEY` where it applies (`DEP_CANCELLED`, `DEP_SENT_ERROR`, `PAY_UNKNOWN`, `PAY_CANCELLED`, `PAY_DUPLICATE`, `UNL_NOT_RELEASED`, `SHOP_LIMIT`, `SRV_DOWN`, `GENERIC`), then on mainnet inside Nimiq Pay.
- Never commit `.env`, `server/data/`, secrets, emails or gift card codes.
