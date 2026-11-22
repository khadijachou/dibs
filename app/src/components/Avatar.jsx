import { useEffect, useId, useState } from 'react'
import { letterFor, isImageDataUrl } from '../lib/friendAvatar.js'

// A rank frame (lib/looks.js FRAMES) drawn as a ring around the avatar, never over it: the .lk-frame box is grown past
// the avatar (CSS), and the hexagon/rect is drawn near that grown box's edge (small `base` inset), so it clears the
// avatar picture at every size. The double ring's inner line (planner) is kept close enough to stay outside too. It
// never changes the avatar's size and never shifts the layout (absolute, nothing rendered for 'none' or an unknown id,
// so the default avatar is pixel-identical). shape 'hex' follows the Nimiq identicon hexagon; 'rect' a letter avatar.
const HEX = [[0.25, 0.06], [0.75, 0.06], [1, 0.5], [0.75, 0.94], [0.25, 0.94], [0, 0.5]]
const hexPoints = (inset) => HEX.map(([x, y]) => `${(inset + x * (100 - 2 * inset)).toFixed(1)},${(inset + y * (100 - 2 * inset)).toFixed(1)}`).join(' ')
// hl (v1.7.7): a light sweep. The frame's own shape is drawn once more as a short lit dash (pathLength 100, the dash
// leaves one short segment; legend's 13/37 leaves two) that travels the ring. No sweep on the planner's inner ring, on
// 'none' or on an unknown frame. The animation and reduced-motion opt-out live in CSS (.lk-frame .lk-hl).
const FRAME = {
  saver: { color: '#2BC48F', hl: { color: '#B8F5DF', dash: '9 91', op: 0.7 } }, // a mint hexagon ring
  planner: { color: '#FFC94D', double: true, hl: { color: '#FFF1C9', dash: '10 90', op: 0.7 } }, // a butter double ring
  collector: { color: '#FFF6EC', dash: '2 5', hl: { color: '#FFFFFF', dash: '11 89', op: 0.9 } }, // a cream dotted ring
  treasurer: { color: '#E9B213', width: 4, hl: { color: '#FFE9A6', dash: '12 88', op: 0.9 } }, // a gold ring
  legend: { grad: ['#E8482A', '#FFC94D'], hl: { color: '#FFF6EC', dash: '13 37', op: 0.9 } }, // a gradient ring (two lit segments)
}
export function FrameRing({ frame, shape = 'hex' }) {
  const uid = useId().replace(/[^a-z0-9]/gi, '')
  const cfg = FRAME[frame]
  if (!cfg) return null // 'none' or unknown: nothing drawn, so the avatar is unchanged
  const gradId = `lkf-${uid}`
  const stroke = cfg.grad ? `url(#${gradId})` : cfg.color
  const w = cfg.width || 3.5
  // One ring (hexagon or rounded square) at the given inset, with any extra SVG props merged in.
  const shapeEl = (inset, props) => (shape === 'hex'
    ? <polygon points={hexPoints(inset)} fill="none" strokeLinejoin="round" {...props} />
    : <rect x={inset} y={inset} width={100 - 2 * inset} height={100 - 2 * inset} rx={18} fill="none" {...props} />)
  const base = 2 // the grown box (CSS: 120%, centred) already holds the gap; draw near its edge, inner double +4 stays outside
  const hl = cfg.hl
  return (
    <svg className="lk-frame" aria-hidden="true" viewBox="0 0 100 100">
      {cfg.grad && <defs><linearGradient id={gradId} x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor={cfg.grad[0]} /><stop offset="1" stopColor={cfg.grad[1]} /></linearGradient></defs>}
      {shapeEl(base, { stroke, strokeWidth: w, strokeDasharray: cfg.dash || undefined, strokeLinecap: cfg.dash ? 'round' : undefined, className: cfg.dash ? 'lk-frame-dots' : undefined })}
      {hl && shapeEl(base, { className: 'lk-hl', stroke: hl.color, strokeWidth: w + 0.4, strokeLinecap: 'round', strokeDasharray: hl.dash, pathLength: 100, opacity: hl.op, style: { color: hl.color } })}
      {cfg.double && shapeEl(base + 4, { stroke, strokeWidth: w * 0.8 })}
    </svg>
  )
}

// The user's Nimiq avatar: the Nimiq identicon of their wallet address (listAccounts()[0]), the same picture Nimiq Pay
// shows. Drawn on the device from the public address; nothing is sent or stored. The library (about 90 kB) loads on
// first use only. Before the address is known it shows a hexagon outline of the same size, so nothing jumps.
const cache = new Map()
const lib = () => import('@nimiq/identicons/dist/identicons.bundle.min.js').then((m) => m.default)
// Identicons hash the text: always the user-friendly form, uppercase, groups of 4 ("NQ20 MJRQ ...").
export const friendly = (a) => String(a || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ')

export function preloadAvatar(address) {
  const key = address ? friendly(address) : null
  if (!key || cache.has(key)) return
  lib().then((I) => I.toDataUrl(key)).then((u) => cache.set(key, u)).catch(() => {})
}

// My own identicon as an SVG data URL, from the wallet address (never the address itself leaves the phone).
export async function identiconSvg(address) {
  const key = friendly(address)
  if (cache.has(key)) return cache.get(key)
  const url = await lib().then((I) => I.toDataUrl(key))
  cache.set(key, url)
  return url
}

// Draw an SVG data URL onto a square canvas and return a PNG data URL (used when the SVG is over the server's cap).
function pngFromSvg(svgUrl, size = 64) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const cv = document.createElement('canvas'); cv.width = size; cv.height = size
        cv.getContext('2d').drawImage(img, 0, 0, size, size)
        resolve(cv.toDataURL('image/png'))
      } catch (e) { reject(e) }
    }
    img.onerror = reject
    img.src = svgUrl
  })
}

// My avatar as a data URL to share: the SVG when it fits the server cap, otherwise a 64 px PNG drawn from it.
export async function myAvatarUrl(address, max = 12288) {
  const svg = await identiconSvg(address)
  if (typeof svg === 'string' && svg.length <= max) return svg
  return pngFromSvg(svg, 64)
}

// seed: draw the identicon from that text instead of a wallet address (friends are always drawn from their seed,
// which is their user id, never their wallet). address: the wallet, as on Profile today.
export function Avatar({ address, seed, size = 56, className = '', fallback = null, frame = null }) {
  const key = seed != null && seed !== '' ? String(seed) : address ? friendly(address) : null
  const [url, setUrl] = useState(() => (key && cache.get(key)) || null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!key) return
    if (cache.has(key)) { setUrl(cache.get(key)); return }
    let live = true
    lib().then((I) => I.toDataUrl(key)).then((u) => { cache.set(key, u); if (live) setUrl(u) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [key])
  if (failed && fallback) return fallback
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      {url ? <img src={url} alt="" width={size} height={size} /> : <i className="avatar-ph" />}
      {frame && <FrameRing frame={frame} shape="hex" />}
    </span>
  )
}

// The Dibs avatar for other people who do not share their Nimiq avatar: their initial on a coral-to-butter gradient.
// Same box, radius and sizes as Avatar. The letter size comes from a token class (never an inline font size).
export function LetterAvatar({ name, size = 40, className = '', frame = null }) {
  return (
    <span className={`avatar frd-letter${size > 44 ? ' big' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="frd-letter-ch">{letterFor(name)}</span>
      {frame && <FrameRing frame={frame} shape="rect" />}
    </span>
  )
}

// Another person's avatar: the data URL they shared, drawn ONLY as an <img> (never markup, a background or a link),
// with the letter avatar as the fallback when there is none or the image fails to load.
// A friend's shared avatar is always their Nimiq identicon (a hexagon), so a frame on the image follows the hexagon;
// a frame on the letter fallback follows its rounded square.
export function FriendAvatar({ avatar, name, size = 40, className = '', frame = null }) {
  const [failed, setFailed] = useState(false)
  if (!isImageDataUrl(avatar) || failed) return <LetterAvatar name={name} size={size} className={className} frame={frame} />
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <img src={avatar} alt="" width={size} height={size} onError={() => setFailed(true)} />
      {frame && <FrameRing frame={frame} shape="hex" />}
    </span>
  )
}
