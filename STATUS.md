# Status

Update this after each work session: what changed, what is blocked, what is next.

## 2026-10-26: skeleton

Done
- App skeleton: catalogue, plan, goal card, deposits, unlock steps, redeem (manual invoice and API modes), code screen, en/fr/es
- Lab screen at `#lab` for checks 1 to 3
- Server: catalogue, redeem, order status, Bitrefill adapter behind an env key
- Demo mode for desktop work

Decisions
- Goals live in device storage for now (one storage module, swap it for the server later)
- Redeem works in two modes: `manual` (user pastes the invoice from the shop page) and `api` (our server creates the order). `manual` is the default until Bitrefill gives us API access
- Prices: NIM/USD from CoinGecko (`nimiq-2`), with a fixed fallback rate in `.env`

To verify (from the build plan)
- [ ] Check 1: `payLightningInvoice` on mainnet with a small real invoice: minimum, fees, time
- [ ] Check 2: staker creation (100 NIM minimum), add stake, read back through RPC
- [ ] Check 3: unlock sequence and waiting times
- [ ] Which validator we use by default (`VITE_DEFAULT_VALIDATOR`)
- [ ] Which RPC URL we can use for staker reads (`VITE_NIMIQ_RPC_URL`), and the method name
- [ ] Bitrefill product links for the catalogue (`app/src/lib/catalog.js`), and the real API shapes in `server/src/bitrefill.js`

Next
- Khadija: run the Lab inside Nimiq Pay, paste the log in Discord
- Mohamed Aziz: Bitrefill email, Sip & Ship questions (28 Oct, 15:00 UTC)

## 2026-10-28: Dibs, Bitrefill wired in

Done
- Renamed to Dibs (brand kit v1: coral, ink, cream, mint, butter; Poppins + Inter; wordmark in the header; "Dibs!" bands)
- Bitrefill through its MCP server, verified with real calls: `server/src/mcp.js` (client-credentials token, renewed automatically), `server/src/bitrefill.js` (get-product-details, buy-products with lightning, get-invoice-by-id)
- Live prices: targets use Bitrefill's payment price (Steam 5 USD = 5.62 USD); catalogue served by the server, fallback in the app
- Redeem in app: email for the receipt, invoice created in place, 30-minute countdown, sats checked against the invoice, paid with payLightningInvoice, code polled and shown once
- Demo mode fakes the invoice when the server has no credentials

Facts from Bitrefill (2026-10-28)
- No account, no fee: dynamic client registration at /oauth/mcp/register, then client_credentials tokens (6 h)
- Invoice response: invoice_id, invoice_access_token, expiration_minutes 30, payment_info.lightningInvoice (BOLT11), satoshiPrice
- No-account purchase limits: 15 gift cards and 2 top-ups a day, 500 USD a day, 1,000 USD a month
- Affiliate code (optional, commission only) via the Become a partner form at bitrefill.com/integrate

To verify
- [ ] get-invoice-by-id response shape after a real payment (status values, where redemption_info sits); the parser accepts JSON or compact text, confirm the fields
- [ ] A real 5 USD purchase end to end on mainnet, timing of the Lightning swap vs the 30-minute lock
- [ ] Catalogue slugs for Amazon, Spotify, Netflix (disabled until confirmed with search-products)
- [ ] Register a fresh client before submission (the first one was pasted in a chat)
