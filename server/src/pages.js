// Two small HTML pages served by the server: /stats (public, "Dibs in numbers") and /admin (needs ADMIN_KEY).
// No framework, Dibs dark colours. Both only read the JSON endpoints; nothing here touches storage.

const HEAD = (title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#15141a" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;500;600&display=swap" />
<style>
:root { --ground: #15141a; --card: #201e28; --line: #2b2834; --cream: #fff6ec; --muted: #9b97a6; --coral: #e8482a; --mint: #2bc48f; --butter: #ffc94d; --red: #ff8a7a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--cream); font: 400 15px/1.5 Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
main { max-width: 560px; margin: 0 auto; padding: 28px 16px 40px; display: flex; flex-direction: column; gap: 14px; }
h1, h2, .n { font-family: Poppins, Inter, sans-serif; }
h1 { margin: 0; font-weight: 700; font-size: 28px; letter-spacing: -.01em; }
.muted { color: var(--muted); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 0 4px rgba(43,196,143,.15); margin-right: 8px; vertical-align: 1px; }
</style>
</head>`

// The Dibs wordmark, copied as is from app/public/dibs-logo/dibs-wordmark-on-dark.svg (coral "d", cream "ibs").
// Inline, not loaded from the app, so this page never depends on the app being up.
const WORDMARK = '<svg xmlns="http://www.w3.org/2000/svg" class="wordmark" viewBox="0 0 360 139" role="img" aria-label="Dibs"><title>Dibs</title><g fill="#E8482A" transform="translate(0 11) scale(0.510417)"><path fill-rule="evenodd" d="M0 153.5a96 96 0 1 0 192 0a96 96 0 1 0-192 0ZM57.5 153a38.5 38.5 0 1 0 77 0a38.5 38.5 0 1 0-77 0Z" /><polygon points="135,0 163.5,28.5 192,0 192,246 135,246" /></g><path fill="#FFF6EC" d="M117 16.43Q117 9.64 121.84 5.14Q126.68 0.64 134.32 0.64Q141.79 0.64 146.63 5.14Q151.47 9.64 151.47 16.43Q151.47 23.05 146.63 27.55Q141.79 32.05 134.32 32.05Q126.68 32.05 121.84 27.55Q117 23.05 117 16.43ZM148.75 41.9V136.64H119.72V41.9ZM226 40.54Q237.72 40.54 247.23 46.49Q256.73 52.43 262.25 63.46Q267.77 74.5 267.77 89.1Q267.77 103.7 262.25 114.82Q256.73 125.95 247.23 131.97Q237.72 138 226 138Q215.99 138 208.51 134.01Q201.04 130.02 196.8 123.4V136.64H167.77V11H196.8V55.31Q200.87 48.69 208.51 44.62Q216.16 40.54 226 40.54ZM217.34 65.84Q208.68 65.84 202.66 72.12Q196.63 78.41 196.63 89.27Q196.63 100.14 202.66 106.42Q208.68 112.7 217.34 112.7Q226 112.7 232.11 106.33Q238.23 99.97 238.23 89.1Q238.23 78.24 232.2 72.04Q226.17 65.84 217.34 65.84ZM275.92 105.57H304.61Q305.12 110.49 309.2 113.55Q313.27 116.61 319.22 116.61Q324.65 116.61 327.62 114.48Q330.59 112.36 330.59 108.97Q330.59 104.89 326.35 102.94Q322.1 100.99 312.59 98.61Q302.41 96.23 295.61 93.6Q288.82 90.97 283.9 85.28Q278.98 79.59 278.98 69.92Q278.98 61.77 283.48 55.06Q287.97 48.35 296.72 44.45Q305.46 40.54 317.52 40.54Q335.34 40.54 345.62 49.37Q355.89 58.2 357.42 72.8H330.59Q329.91 67.88 326.26 64.99Q322.61 62.11 316.67 62.11Q311.57 62.11 308.86 64.06Q306.14 66.01 306.14 69.41Q306.14 73.48 310.47 75.52Q314.8 77.56 323.97 79.59Q334.5 82.31 341.12 84.94Q347.74 87.57 352.75 93.43Q357.76 99.29 357.93 109.14Q357.93 117.46 353.26 123.99Q348.59 130.53 339.84 134.26Q331.1 138 319.55 138Q307.16 138 297.48 133.76Q287.8 129.51 282.2 122.13Q276.6 114.74 275.92 105.57Z"/></svg>'

export const statsPage = `${HEAD('Dibs in numbers')}
<style>
.brand { display: flex; align-items: center; }
.brand .wordmark { height: 36px; width: auto; display: block; }
.hero { background: linear-gradient(160deg, #2a1c1f, #1b1a21); border-color: #3a2a2c; padding: 22px 18px; }
.hero .label { font-size: 13px; color: #d9cfd3; }
.hero .n { font-weight: 700; font-size: 40px; line-height: 1.1; margin: 6px 0 4px; color: var(--cream); }
.hero .n small { font-size: 18px; color: var(--coral); margin-left: 6px; }
.hero .sub { font-size: 13px; color: var(--muted); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px; min-width: 0; }
.tile .k { font-size: 12.5px; color: var(--muted); }
.tile .n { font-weight: 700; font-size: 26px; margin: 2px 0; }
.tile .s { font-size: 12px; color: var(--muted); }
.tile.mint .n { color: var(--mint); } .tile.butter .n { color: var(--butter); }
.asof { font-size: 13px; color: var(--muted); }
.note { font-size: 13px; color: var(--muted); line-height: 1.55; }
.err { color: var(--red); font-size: 14px; }
@media (max-width: 340px) { .grid { grid-template-columns: 1fr; } }
</style>
<body>
<main>
  <div class="brand">${WORDMARK}</div>
  <h1>Dibs in numbers</h1>
  <section class="card hero">
    <div class="label">NIM saved through Dibs</div>
    <div class="n"><span id="nim">…</span><small>NIM</small></div>
    <div class="sub">verified deposits, staked with Garuda Pool</div>
  </section>
  <section class="grid" id="tiles"></section>
  <p class="asof" id="asof"></p>
  <p class="note">These numbers come from people who tapped Share stats. Goals, deposits and purchases are counted anonymously: never a name, an email or a gift card code. Deposits count only once they are found on the Nimiq blockchain. People who said no are not counted.</p>
</main>
<script>
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
function tile(k, n, s, tone) { return '<div class="tile ' + (tone || '') + '"><div class="k">' + esc(k) + '</div><div class="n">' + esc(n) + '</div><div class="s">' + esc(s) + '</div></div>' }
async function load() {
  try {
    const r = await fetch('/api/stats', { cache: 'no-store' })
    const d = await r.json()
    document.getElementById('nim').textContent = fmt(d.nimAddedVerified)
    document.getElementById('tiles').innerHTML = [
      tile('People who used Dibs', fmt(d.people), 'phones that shared stats'),
      tile('Savers', fmt(d.savers), 'with a deposit found on chain'),
      tile('Goals created', fmt(d.goalsCreated), fmt(d.goalsActive) + ' active right now'),
      tile('Goals reached', fmt(d.goalsReached), 'saved up to 100%', 'mint'),
      tile('Cards bought', fmt(d.cardsBought), 'about ' + fmt(d.cardsUsd) + ' USD in total', 'butter'),
      tile('NIM earned from staking', fmt(d.nimEarned), 'rewards so far', 'mint'),
    ].join('')
    document.getElementById('asof').innerHTML = '<span class="dot" aria-hidden="true"></span>As of ' + esc(new Date(d.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }))
  } catch {
    document.getElementById('asof').innerHTML = '<span class="err">The numbers could not be loaded. Try again in a moment.</span>'
  }
}
load()
setInterval(load, 60000)
</script>
</body>
</html>`

export const adminPage = `${HEAD('Dibs admin')}
<style>
form { display: flex; gap: 8px; }
input { flex: 1; min-width: 0; height: 44px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); color: var(--cream); padding: 0 12px; font: inherit; }
button { height: 44px; border: 0; border-radius: 12px; padding: 0 16px; background: var(--coral); color: #fff; font: 600 14px Inter, sans-serif; cursor: pointer; }
h2 { margin: 10px 0 0; font-size: 16px; font-weight: 600; }
.wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-weight: 500; }
td.v { text-align: right; font-variant-numeric: tabular-nums; }
.err { color: var(--red); }
</style>
<body>
<main>
  <h1>Dibs admin</h1>
  <form id="f"><input id="key" type="password" autocomplete="off" placeholder="Admin key" aria-label="Admin key" /><button>Load</button></form>
  <p id="msg" class="muted"></p>
  <div id="out"></div>
</main>
<script>
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const KEY = 'dibs.adminKey'
const keyEl = document.getElementById('key')
try { keyEl.value = sessionStorage.getItem(KEY) || '' } catch {}
function table(title, head, rows) {
  return '<h2>' + esc(title) + '</h2><div class="card wrap"><table><tr>' + head.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr>' +
    rows.map((r) => '<tr>' + r.map((c, i) => '<td' + (i ? ' class="v"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table></div>'
}
const kv = (o) => Object.entries(o || {}).map(([k, v]) => [k, v])
async function load() {
  const key = keyEl.value.trim()
  try { sessionStorage.setItem(KEY, key) } catch {}
  const msg = document.getElementById('msg')
  msg.textContent = 'Loading…'
  try {
    const r = await fetch('/api/admin/stats', { headers: { 'x-admin-key': key }, cache: 'no-store' })
    if (!r.ok) { msg.innerHTML = '<span class="err">Not found. Check the key.</span>'; document.getElementById('out').innerHTML = ''; return }
    const d = await r.json()
    msg.innerHTML = '<span class="dot"></span>Updated ' + esc(new Date(d.updatedAt).toLocaleString()) + (d.durable ? '' : ' · storage durable: false')
    const pub = ['people', 'savers', 'goalsCreated', 'goalsActive', 'goalsReached', 'cardsBought', 'cardsUsd', 'nimAddedVerified', 'nimStakedNow', 'nimEarned', 'since']
    document.getElementById('out').innerHTML = [
      table('Public numbers', ['Number', 'Value'], pub.map((k) => [k, d[k]])),
      table('Brand funnel', ['Brand', 'Created', 'First deposit', 'Reached', 'Bought'], Object.entries(d.brands).sort((a, b) => b[1].created - a[1].created).map(([b, v]) => [b, v.created, v.firstDeposit, v.reached, v.bought])),
      table('Weeks presets', ['Weeks', 'Goals'], kv(d.weeksPresets)),
      table('Deposits', ['Number', 'Value'], [['Median deposit (NIM)', d.medianDepositNim], ['Median days to first deposit', d.medianDaysToFirstDeposit], ['Unverified deposits', d.unverifiedDeposits], ['Waiting for the chain check', d.pendingChecks]]),
      table('Unlock steps', ['Mode', 'Deactivate', 'Retire', 'Remove'], kv(d.unlockSteps).map(([m, v]) => [m, v.deactivate, v.retire, v.remove])),
      table('Other', ['Number', 'Value'], [['Withdrawals', d.withdrawals], ['Moves', d.moves.count], ['NIM moved', d.moves.nim], ['Deletions', d.deletions], ['Stored events', d.storedEvents]]),
      table('Errors', ['Key', 'Count'], kv(d.errors).sort((a, b) => b[1] - a[1])),
      table('Last 14 days', ['Day', 'Events', 'Catalogue answers with fallback prices'], d.days.map((x) => [x.day, x.events, x.catalogFallback])),
    ].join('')
  } catch {
    msg.innerHTML = '<span class="err">The server could not be reached.</span>'
  }
}
document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); load() })
if (keyEl.value) load()
</script>
</body>
</html>`
