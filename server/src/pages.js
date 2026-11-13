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

// Public page: every value from /api/stats is written with textContent (or a numeric style width), never as HTML.
// Its styles live here only, so the admin page (which shares HEAD) is unchanged.
export const statsPage = `${HEAD('Dibs in numbers')}
<style>
.st { --s-mint: #15896A; --s-coral: #E8482A; --s-butter: #FFC94D; --s-cream: #FFF6EC; --s-dark: #1B1920; gap: 12px; }
.st [hidden] { display: none !important; }
.st .brand { display: flex; align-items: center; }
.st .brand .wordmark { height: 32px; width: auto; display: block; }
.st h1 { font-weight: 600; font-size: 26px; line-height: 1.2; margin: 6px 0 0; }
.st .lede { margin: -6px 0 4px; font-size: 14px; color: var(--muted); }
.st .hero { position: relative; overflow: hidden; border-radius: 20px; border: 1px solid rgba(232, 72, 42, .35); padding: 20px 18px 18px;
  background: radial-gradient(220px 160px at 100% 0%, rgba(232, 72, 42, .22), rgba(232, 72, 42, 0) 70%), linear-gradient(160deg, #2a1c1f, var(--s-dark)); }
.st .hero .label { font-size: 12px; font-weight: 500; color: #d9cfd3; }
.st .hero .big { font-family: Poppins, Inter, sans-serif; font-weight: 600; font-size: 40px; line-height: 1.1; margin: 6px 0 0; color: var(--s-cream); overflow-wrap: anywhere; }
.st .hero .big small { font-family: Inter, system-ui, sans-serif; font-size: 15px; font-weight: 600; color: var(--s-coral); margin-left: 8px; }
.st .hero hr { border: 0; border-top: 1px solid rgba(255, 246, 236, .1); margin: 16px 0 14px; }
.st .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.st .pair .v { font-family: Poppins, Inter, sans-serif; font-weight: 600; font-size: 16px; color: var(--s-cream); overflow-wrap: anywhere; }
.st .pair .c { font-size: 12px; color: var(--muted); }
.st .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.st .tile { --t: var(--s-cream); --t-bg: rgba(255, 246, 236, .14); background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 14px; min-width: 0; display: flex; flex-direction: column; }
.st .tile.coral { --t: var(--s-coral); --t-bg: rgba(232, 72, 42, .16); }
.st .tile.mint { --t: var(--s-mint); --t-bg: rgba(21, 137, 106, .16); }
.st .tile.butter { --t: var(--s-butter); --t-bg: rgba(255, 201, 77, .15); }
.st .ico { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; background: var(--t-bg); color: var(--t); margin-bottom: 10px; }
.st .ico svg { width: 16px; height: 16px; }
.st .tile .k { font-size: 12px; color: var(--muted); }
.st .tile .n { font-family: Poppins, Inter, sans-serif; font-weight: 600; font-size: 26px; line-height: 1.25; margin: 2px 0; color: var(--s-cream); overflow-wrap: anywhere; }
.st .tile .s { font-size: 12.5px; color: var(--muted); line-height: 1.4; }
.st .tile.nodata .n { font-size: 17px; line-height: 1.4; margin: 6px 0 4px; color: var(--muted); }
.st .bar { height: 5px; border-radius: 999px; background: rgba(255, 246, 236, .08); margin-top: auto; overflow: hidden; }
.st .tile .s + .bar { margin-top: 10px; }
.st .bar i { display: block; height: 100%; width: 0; border-radius: 999px; background: var(--t); transition: width .6s ease; }
.st .live { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); margin: 2px 2px 0; }
.st .live-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--s-mint); animation: st-live 2.4s ease-out infinite; }
@keyframes st-live { 0% { box-shadow: 0 0 0 0 rgba(21, 137, 106, .55); } 70% { box-shadow: 0 0 0 8px rgba(21, 137, 106, 0); } 100% { box-shadow: 0 0 0 0 rgba(21, 137, 106, 0); } }
@media (prefers-reduced-motion: reduce) { .st .live-dot { animation: none; box-shadow: 0 0 0 4px rgba(21, 137, 106, .2); } .st .bar i { transition: none; } }
.st .err { color: var(--red); font-size: 14px; margin: 2px; }
.st .note { display: flex; gap: 12px; align-items: flex-start; border-radius: 16px; }
.st .note .ico { --t: var(--s-mint); --t-bg: rgba(21, 137, 106, .16); flex: none; margin: 0; }
.st .note p { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.55; }
@media (max-width: 340px) { .st .grid { grid-template-columns: 1fr; } }
</style>
<body>
<main class="st">
  <div class="brand">${WORDMARK}</div>
  <h1>Dibs in numbers</h1>
  <p class="lede">Live numbers from the people who save with Dibs.</p>
  <section class="card hero">
    <div class="label">NIM deposited through Dibs</div>
    <div class="big"><span id="nim">-</span><small>NIM</small></div>
    <hr />
    <div class="pair">
      <div><div class="v" id="staked">-</div><div class="c">staked right now</div></div>
      <div><div class="v" id="since">-</div><div class="c">counting since</div></div>
    </div>
  </section>
  <section class="grid">
    <div class="tile">
      <span class="ico" aria-hidden="true"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M22 21v-2a4 4 0 0 0-3-3.87'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/></svg></span>
      <div class="k">People</div><div class="n" id="people">-</div><div class="s">phones that shared stats</div>
    </div>
    <div class="tile coral">
      <span class="ico" aria-hidden="true"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><ellipse cx='12' cy='6' rx='8' ry='3'/><path d='M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6'/><path d='M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6'/></svg></span>
      <div class="k">Savers</div><div class="n" id="savers">-</div><div class="s" id="saversSub">-</div>
      <div class="bar" aria-hidden="true"><i id="saversBar"></i></div>
    </div>
    <div class="tile">
      <span class="ico" aria-hidden="true"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='5'/><circle cx='12' cy='12' r='1'/></svg></span>
      <div class="k">Goals created</div><div class="n" id="created">-</div><div class="s" id="createdSub">-</div>
      <div class="bar" aria-hidden="true"><i id="createdBar"></i></div>
    </div>
    <div class="tile mint">
      <span class="ico" aria-hidden="true"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><path d='m8 12.5 2.8 2.8L16 9.5'/></svg></span>
      <div class="k">Goals reached</div><div class="n" id="reached">-</div><div class="s" id="reachedSub">-</div>
      <div class="bar" aria-hidden="true"><i id="reachedBar"></i></div>
    </div>
    <div class="tile butter">
      <span class="ico" aria-hidden="true"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='2.5' y='5' width='19' height='14' rx='2.5'/><path d='M2.5 10h19'/><path d='M6.5 15h4'/></svg></span>
      <div class="k">Cards bought</div><div class="n" id="cards">-</div><div class="s" id="cardsSub">-</div>
    </div>
    <div class="tile mint" id="earnedTile">
      <span class="ico" aria-hidden="true"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 17l6-6 4 4 8-8'/><path d='M14 7h7v7'/></svg></span>
      <div class="k">Earned from staking</div><div class="n" id="earned">-</div><div class="s" id="earnedSub">-</div>
    </div>
  </section>
  <p class="live" id="live" hidden><span class="live-dot" aria-hidden="true"></span><span>Live</span></p>
  <p class="err" id="err" role="status" hidden>The numbers could not be loaded. Try again in a moment.</p>
  <section class="card note">
    <span class="ico" aria-hidden="true"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'/><path d='m9 12 2 2 4-4'/></svg></span>
    <p>Only phones that tapped Share stats are counted, anonymously: never a name, an email or a gift card code. A deposit counts once it is found on the Nimiq blockchain. NIM withdrawn and deposited again counts each time.</p>
  </section>
</main>
<script>
// Numbers only: a missing or non-numeric field shows "-".
const isNum = (v) => typeof v === 'number' && isFinite(v)
const fmt = (v) => isNum(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-'
// Share of a base, 0 when the base is 0 or missing.
const pct = (part, base) => isNum(part) && isNum(base) && base > 0 ? Math.round(part / base * 100) : 0
// NIM earned, same rules as the app (app/src/lib/format.js fmtEarned): 10 and up whole, under 10 two decimals,
// under 0.01 "< 0.01". Always rounded down.
function fmtEarned(v) {
  if (!isNum(v)) return '-'
  if (v <= 0) return '0'
  if (v < 0.01) return '< 0.01'
  if (v < 10) return '+' + (Math.floor(v * 100 + 1e-9) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '+' + Math.floor(v).toLocaleString('en-US')
}
function day(s) {
  const d = new Date(s)
  return s && !isNaN(d) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'
}
const $ = (id) => document.getElementById(id)
const put = (id, text) => { $(id).textContent = text }
const bar = (id, p) => { $(id).style.width = Math.max(0, Math.min(100, p)) + '%' }
async function load() {
  try {
    const r = await fetch('/api/stats', { cache: 'no-store' })
    if (!r.ok) throw new Error('status ' + r.status)
    const d = await r.json()
    if (!d || typeof d !== 'object') throw new Error('bad body')
    put('nim', fmt(d.nimAddedVerified))
    put('staked', isNum(d.nimStakedNow) ? fmt(d.nimStakedNow) + ' NIM' : '-')
    put('since', day(d.since))
    put('people', fmt(d.people))
    put('savers', fmt(d.savers))
    const sp = pct(d.savers, d.people)
    put('saversSub', sp + '% of people saved')
    bar('saversBar', sp)
    put('created', fmt(d.goalsCreated))
    put('createdSub', fmt(d.goalsActive) + ' active right now')
    bar('createdBar', pct(d.goalsActive, d.goalsCreated))
    put('reached', fmt(d.goalsReached))
    const rp = pct(d.goalsReached, d.goalsCreated)
    put('reachedSub', rp + '% of goals at 100%')
    bar('reachedBar', rp)
    put('cards', fmt(d.cardsBought))
    put('cardsSub', 'about ' + fmt(d.cardsUsd) + ' USD in total')
    const noEarned = d.nimEarned == null
    $('earnedTile').classList.toggle('nodata', noEarned)
    put('earned', noEarned ? 'Not enough data yet' : (isNum(d.nimEarned) ? fmtEarned(d.nimEarned) + ' NIM' : '-'))
    put('earnedSub', noEarned ? 'shown once phones report it' : 'staking rewards so far')
    $('live').hidden = false
    $('err').hidden = true
  } catch {
    $('live').hidden = true
    $('err').hidden = false
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
    const pub = ['people', 'savers', 'goalsCreated', 'goalsActive', 'goalsReached', 'cardsBought', 'cardsUsd', 'nimAddedVerified', 'nimStakedNow', 'nimEarned', 'earnedReports', 'since']
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
