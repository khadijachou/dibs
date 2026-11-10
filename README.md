# Dibs

Call dibs. Save up. It's yours.

Dibs is a Nimiq Pay mini app. You call dibs on something you want (a gift card, mobile data, a top-up), set a target, and add NIM whenever you can. Every deposit goes into your own staker, so the savings earn while you wait and never leave your wallet. When you reach the target, you unlock the NIM and get the item with one tap: the app creates a Bitrefill invoice and Nimiq Pay pays it from your NIM over Lightning. The code appears in the app.

Category: Save. Built for the Nimiq Mini Apps Competition, Cycle 3.

## Repo layout

| Folder | What it is |
| --- | --- |
| `app/` | The mini app: Vite + React, runs inside Nimiq Pay |
| `server/` | Small backend: live catalogue prices, Bitrefill invoices, order status. Holds the Bitrefill credentials, never user funds |

## 1. Server (needed for prices and purchases)

```bash
cd server
cp .env.example .env      # fill in the Bitrefill client id and secret (see below)
npm install
npm run dev               # http://localhost:8787
```

Bitrefill credentials come from their MCP server, with no account and no fee. Register a client once (the response holds `client_id` and `client_secret`; put them in `server/.env`):

```powershell
'{"client_name":"Dibs","grant_types":["client_credentials"],"token_endpoint_auth_method":"client_secret_post","redirect_uris":["https://localhost/callback"],"scope":"mcp"}' | Set-Content -Encoding ascii "$HOME\reg.json"
curl.exe -s -X POST "https://api.bitrefill.com/oauth/mcp/register" -H "Content-Type: application/json" --data "@$HOME\reg.json"
```

The server fetches and renews its own access token. Without credentials it still serves the catalogue with fallback prices, and `POST /api/redeem` answers 501.

Endpoints: `GET /api/health`, `GET /api/catalog`, `POST /api/redeem {itemId, email}`, `GET /api/orders/:id`.

## 2. App

```bash
cd app
cp .env.example .env      # leave VITE_REDEEM_MODE=api; set the validator when you have it
npm install
npm run dev               # serves on your LAN IP, port 5173, and proxies /api to the server
```

On the phone: Nimiq Pay > Mini Apps > Custom URL > `http://<your LAN IP>:5173`.

Outside Nimiq Pay (a desktop browser) the app runs in **demo mode** with a fake wallet and a fake invoice, so screens can be built without a phone. A yellow "Demo mode" badge shows when this is the case.

`VITE_REDEEM_MODE=manual` switches to the fallback flow where the user opens the shop page and pastes the invoice back.

## The Lab (checks 1 to 3)

Open `http://<your LAN IP>:5173/#lab` inside Nimiq Pay. One button per check from the build plan: pay a Lightning invoice you paste, create a staker, add stake, read it back, raw RPC calls, and the three unlock steps. Every result lands in a log with a Copy button.

## Catalogue

What Dibs sells lives in `server/catalog.json`. Manage it from the `server` folder (runs on your PC only):

```bash
npm run catalog -- search amazon          # find products (US by default, add a country code: FR, MX...)
npm run catalog -- show amazon_com-usa    # amounts, prices, Lightning support
npm run catalog -- add amazon_com-usa 10,25 "Amazon gift card"
npm run catalog -- list
npm run catalog -- remove amazon_com-usa-10
```

`add` refuses products that are out of stock, not payable over Lightning, or that need a phone number or account. The server rereads the file on change: reload the app to see new items.

## Prices

Bitrefill charges above face value (a 5 USD Steam card costs about 5.62 USD). Targets are built from Bitrefill's payment price, read live and cached 5 minutes. The catalogue lives in `server/src/index.js` (slug + package value) with a fallback copy in `app/src/lib/catalog.js`.

## Data and privacy

Dibs sends usage numbers only if the user taps **Share stats** (onboarding, or the card on Goals for people who onboarded earlier). Tap **No thanks**, or switch it off in More > Settings, and Dibs sends nothing.

- Shared, anonymously: goals created, NIM added and cards bought (plus daily opens, unlock steps and error keys, never error messages).
- Never shared: a name, an email, a gift card code, PIN or link, an order token, a Nimiq address.
- To count each phone once, the phone makes a random ID (`dibs.anonId`); the server stores only `HMAC-SHA256(STATS_SALT, anonId)`.
- To make sure every deposit is real, the server checks its transaction ID once on the Nimiq blockchain (deposits must go to the staking contract with the reported amount), then deletes it. The hash waits in memory only, at most 24 h, and is never written to storage or returned by any endpoint. Public NIM totals count verified deposits only.
- More > Settings > **Delete what was shared** removes every event of that phone from the server, and the public totals go down accordingly.
- The totals are public: `/stats` on the server ("Dibs in numbers"), JSON at `/api/stats`. `/admin` needs `ADMIN_KEY`.

Server env: `STATS_SALT` (required for stats; missing = `POST /api/events` answers 503), `ADMIN_KEY`, and optionally `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for durable storage (without them events live in `server/data/events.ndjson` and `/api/stats` says `durable: false`).

## Rules we follow

- Public repo, MIT license, no secrets: credentials live in `.env` files and `server/data/`, both git-ignored.
- Runs on mainnet for the submission.
- See `SECURITY.md` for the threat model and `STATUS.md` for where we are.
