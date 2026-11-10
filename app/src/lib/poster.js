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

// chips: optional short labels under the line (prompt 2 adds Level and Rank).
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
export async function shareBadge(badgeId, { t, name, toast }) {
  try {
    const text = shareText(badgeId, t)
    const copied = copyText(text)
    const filename = `dibs-badge-${badgeId}.png`
    if (canShareFiles()) {
      const blob = await drawPoster({ name, badgeId, t })
      const file = new File([blob], filename, { type: 'image/png' })
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancelled' }
      }
    }
    await copied
    try { download(await drawPoster({ name, badgeId, t }), filename) } catch { /* the text is still copied */ }
    try { window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener') } catch { /* blocked */ }
    toast?.(t('share_badge_saved'))
    return 'fallback'
  } catch {
    return 'failed'
  }
}
