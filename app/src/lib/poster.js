// Share on X: a 1080 x 1350 PNG poster of one badge, drawn on the phone. Nothing goes to our server.
import { medalSvg } from '../components/Badge.jsx'
import { CORAL, CREAM, IBS, MARK_RIBBON, MARK_RING } from '../components/ui.jsx'
import { copyText } from './clipboard.js'

const W = 1080
const H = 1350
const SITE = 'https://dibs-sepia.vercel.app'
const HANDLE = '@calldibs_app'
const BUTTER = '#FFC94D'

// The poster title never carries an exclamation mark ("Dibs!" and "¡Dibs!" become "Dibs").
export const posterTitle = (name) => String(name).replace(/[!¡]/g, '').trim()

function svgImage(markup) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  })
}

const wordmarkSvg = () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 139" width="360" height="139">'
  + `<g fill="${CORAL}" transform="translate(0 11) scale(0.510417)"><path fill-rule="evenodd" d="${MARK_RING}"/><polygon points="${MARK_RIBBON}"/></g>`
  + `<path fill="${CREAM}" d="${IBS}"/></svg>`

// One line, shrunk until it fits maxWidth.
function fitText(ctx, text, { weight, size, family, maxWidth }) {
  let s = size
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 2 } while (ctx.measureText(text).width > maxWidth && s > 24)
}

function wrap(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word } else line = next
  }
  if (line) lines.push(line)
  return lines
}

// chips: short labels under the line: the level and the rank (App.jsx shareBadge).
export async function drawPoster({ name, badgeId, t, chips = [] }) {
  try {
    await Promise.all(['700 92px Poppins', '600 40px Inter', '400 38px Inter'].map((f) => document.fonts.load(f)))
    await document.fonts.ready
  } catch { /* system fonts then */ }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#1B1920'
  ctx.fillRect(0, 0, W, H)

  const medalW = 400
  const medalH = Math.round(medalW * 24 / 27)
  const medalTop = 330
  const cy = medalTop + medalH / 2
  const glow = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, 520)
  glow.addColorStop(0, 'rgba(232,72,42,.18)')
  glow.addColorStop(1, 'rgba(232,72,42,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = CREAM
  const who = name || t('poster_someone')
  fitText(ctx, who, { weight: 700, size: 92, family: 'Poppins, sans-serif', maxWidth: 960 })
  ctx.fillText(who, W / 2, 190)

  ctx.fillStyle = BUTTER
  ctx.font = '600 40px Inter, sans-serif'
  ctx.fillText(t('poster_awarded'), W / 2, 262)

  const medal = await svgImage(medalSvg(badgeId, true, medalW))
  ctx.drawImage(medal, (W - medalW) / 2, medalTop, medalW, medalH)

  let y = medalTop + medalH + 130
  ctx.fillStyle = CREAM
  const title = posterTitle(t(`badge_${badgeId}`))
  fitText(ctx, title, { weight: 700, size: 88, family: 'Poppins, sans-serif', maxWidth: 960 })
  ctx.fillText(title, W / 2, y)

  y += 78
  ctx.fillStyle = '#c9c6d0'
  ctx.font = '400 38px Inter, sans-serif'
  for (const line of wrap(ctx, t(`badge_${badgeId}_done`), 840)) { ctx.fillText(line, W / 2, y); y += 52 }

  if (chips.length) {
    y += 24
    ctx.font = '600 30px Inter, sans-serif'
    const pads = chips.map((c) => ctx.measureText(c).width + 48)
    let x = (W - (pads.reduce((s, p) => s + p, 0) + 16 * (chips.length - 1))) / 2
    chips.forEach((c, i) => {
      ctx.fillStyle = '#2a2733'
      ctx.beginPath()
      ctx.roundRect(x, y - 38, pads[i], 56, 28)
      ctx.fill()
      ctx.fillStyle = CREAM
      ctx.fillText(c, x + pads[i] / 2, y)
      x += pads[i] + 16
    })
  }

  // Bottom: the wordmark on the left, the handle and the tagline on the right.
  const wmH = 64
  const wmW = Math.round(wmH * 360 / 139)
  const bottom = H - 90
  ctx.drawImage(await svgImage(wordmarkSvg()), 90, bottom - wmH, wmW, wmH)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#b9b5c2'
  ctx.font = '600 30px Inter, sans-serif'
  ctx.fillText(HANDLE, W - 90, bottom - 34)
  ctx.font = '400 26px Inter, sans-serif'
  ctx.fillText(t('tagline'), W - 90, bottom)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Poster failed'))), 'image/png'))
}

export const shareText = (badgeId, t) =>
  `${t('share_badge_text', { badge: t(`badge_${badgeId}`), done: t(`badge_${badgeId}_done`) })}\n${SITE}`

// ---------------------------------------------------------------------------
// Share your month (v1.3.0): a 1080 x 1350 image of this month's saving. Fixed dark colours in both themes. Totals only:
// it draws the numbers from lib/insights.js monthShareStats and brand logos the app already ships, never an address, a
// balance, a fiat value, a code or a user-typed goal name.
const SECONDARY = '#c9c6d0'
const SMALL = '#9a97a6'
const MINT = '#2bc48f'

function loadImage(src) {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src })
}

// The month-image text: the tagline's last sentence in mint, the rest in cream, centred on one line.
function drawTagline(ctx, t) {
  const full = t('tagline')
  const i = full.lastIndexOf('. ')
  const rest = i >= 0 ? full.slice(0, i + 2) : ''
  const last = i >= 0 ? full.slice(i + 2) : full
  ctx.font = '600 32px Inter, sans-serif'
  ctx.textAlign = 'left'
  const wRest = ctx.measureText(rest).width
  const wLast = ctx.measureText(last).width
  let x = (W - (wRest + wLast)) / 2
  const y = H - 80
  ctx.fillStyle = CREAM
  ctx.fillText(rest, x, y)
  ctx.fillStyle = MINT
  ctx.fillText(last, x + wRest, y)
  ctx.textAlign = 'center'
}

// stats: lib/insights.js monthShareStats. monthLabel: the month and year in the app's language (no day). logos: up to
// six { logo?, bg, fg, letter } from the goals saved this month (the screen resolves them; the poster never sees a name).
export async function drawMonthPoster({ stats, monthLabel, logos = [], t, lang }) { // eslint-disable-line no-unused-vars
  try {
    await Promise.all(['700 84px Poppins', '600 64px Poppins', '600 40px Inter', '400 34px Inter'].map((f) => document.fonts.load(f)))
    await document.fonts.ready
  } catch { /* system fonts then */ }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#1B1920'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 360, 0, W / 2, 360, 620)
  glow.addColorStop(0, 'rgba(232,72,42,.20)')
  glow.addColorStop(1, 'rgba(232,72,42,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Wordmark at the top.
  const wmH = 70
  const wmW = Math.round(wmH * 360 / 139)
  ctx.drawImage(await svgImage(wordmarkSvg()), (W - wmW) / 2, 96, wmW, wmH)

  // Month and year, then the heading.
  ctx.fillStyle = SMALL
  ctx.font = '600 38px Inter, sans-serif'
  ctx.fillText(monthLabel, W / 2, 248)
  ctx.fillStyle = CREAM
  ctx.font = '700 72px Poppins, sans-serif'
  ctx.fillText(posterTitle(t('img_title')), W / 2, 340)

  // NIM saved this month.
  ctx.fillStyle = BUTTER
  ctx.font = '700 92px Poppins, sans-serif'
  const saved = t('img_saved', { n: new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(Math.floor(stats.nim)).replace(/ /g, ' ') })
  fitText(ctx, saved, { weight: 700, size: 92, family: 'Poppins, sans-serif', maxWidth: 940 })
  ctx.fillText(saved, W / 2, 450)

  // The 8 weekly bars, the current week in butter.
  const bx = 160
  const bw = W - bx * 2
  const gap = 18
  const barW = (bw - gap * 7) / 8
  const base = 700
  const maxH = 180
  const max = Math.max(1, ...stats.weekly)
  stats.weekly.forEach((n, i) => {
    const h = n > 0 ? Math.max(14, Math.round((n / max) * maxH)) : 6
    const x = bx + i * (barW + gap)
    ctx.fillStyle = n === 0 ? '#3a3744' : i === 7 ? BUTTER : CORAL
    ctx.beginPath()
    ctx.roundRect(x, base - h, barW, h, 10)
    ctx.fill()
  })

  // Three numbers.
  ctx.fillStyle = CREAM
  ctx.font = '600 44px Poppins, sans-serif'
  ctx.fillText(t('img_weeks', { n: stats.weeksSaved }), W / 2, base + 110)
  ctx.fillStyle = SECONDARY
  ctx.font = '400 38px Inter, sans-serif'
  ctx.fillText(`${stats.goalsCount} ${t('img_goals')}   ·   ${stats.at100} ${t('img_100')}`, W / 2, base + 168)

  // The logos of the goals saved this month.
  if (logos.length) {
    const tiles = logos.slice(0, 6)
    const size = 92
    const lgap = 22
    const total = tiles.length * size + (tiles.length - 1) * lgap
    let x = (W - total) / 2
    const y = base + 240
    for (const g of tiles) {
      const img = g.logo ? await loadImage(g.logo) : null
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(x, y, size, size, 20)
      ctx.clip()
      if (img) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(x, y, size, size)
        ctx.drawImage(img, x + 10, y + 10, size - 20, size - 20)
      } else {
        ctx.fillStyle = g.bg || '#35323f'
        ctx.fillRect(x, y, size, size)
        ctx.fillStyle = g.fg || '#ffffff'
        ctx.font = '700 46px Poppins, sans-serif'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(g.letter || '?').toUpperCase(), x + size / 2, y + size / 2 + 2)
        ctx.textBaseline = 'alphabetic'
      }
      ctx.restore()
      x += size + lgap
    }
  }

  drawTagline(ctx, t)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Poster failed'))), 'image/png'))
}

export const monthShareText = (monthLabel, t) => `${t('img_title')}, ${monthLabel}\n${SITE}`

// Shares the month image through the same path as a badge: the system share sheet with the file where possible, else
// save + open the X post page. Returns 'shared' | 'cancelled' | 'fallback' | 'failed' (App.jsx then runs the confirm
// step, which grants the +30 XP once a month). The post text carries no numbers, address or code.
export async function shareMonth({ stats, monthLabel, logos, t, lang, toast }) {
  try {
    const text = monthShareText(monthLabel, t)
    const copied = copyText(text)
    const filename = `dibs-month-${stats.monthKey}.png`
    if (canShareFiles()) {
      const blob = await drawMonthPoster({ stats, monthLabel, logos, t, lang })
      const file = new File([blob], filename, { type: 'image/png' })
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancelled' }
      }
    }
    await copied
    try { download(await drawMonthPoster({ stats, monthLabel, logos, t, lang }), filename) } catch { /* the text is still copied */ }
    try { window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener') } catch { /* blocked */ }
    toast?.(t('share_badge_saved'))
    return 'fallback'
  } catch {
    return 'failed'
  }
}

function canShareFiles() {
  try { return Boolean(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })) } catch { return false }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// a) The system share sheet with the image where the browser can share files. b) Otherwise: save the image, open the
// X post page, and say so. The post text is copied right at the tap in both cases (X sometimes drops shared text);
// the copy is not awaited before navigator.share, so the share stays inside the tap.
// Returns 'shared' (navigator.share resolved), 'cancelled' (AbortError), 'fallback' (copy + save + X page ran) or
// 'failed'. The caller marks Spread the word only for a real share (lib/badges.js shareEarns).
export async function shareBadge(badgeId, { t, name, toast, chips = [] }) {
  try {
    const text = shareText(badgeId, t)
    const copied = copyText(text)
    const filename = `dibs-badge-${badgeId}.png`
    if (canShareFiles()) {
      const blob = await drawPoster({ name, badgeId, t, chips })
      const file = new File([blob], filename, { type: 'image/png' })
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancelled' }
      }
    }
    await copied
    try { download(await drawPoster({ name, badgeId, t, chips }), filename) } catch { /* the text is still copied */ }
    try { window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener') } catch { /* blocked */ }
    toast?.(t('share_badge_saved'))
    return 'fallback'
  } catch {
    return 'failed'
  }
}
