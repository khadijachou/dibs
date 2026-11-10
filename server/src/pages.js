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

export const statsPage = `${HEAD('Dibs in numbers')}
<style>
.brand { display: flex; align-items: center; gap: 10px; font: 700 18px Poppins, sans-serif; }
.brand i { width: 28px; height: 28px; border-radius: 8px; background: var(--coral); display: inline-block; }
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
  <div class="brand"><i aria-hidden="true"></i>Dibs</div>
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
