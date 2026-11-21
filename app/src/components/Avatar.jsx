import { useEffect, useState } from 'react'
import { letterFor, isImageDataUrl } from '../lib/friendAvatar.js'

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
export function Avatar({ address, seed, size = 56, className = '', fallback = null }) {
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
    </span>
  )
}

// The Dibs avatar for other people who do not share their Nimiq avatar: their initial on a coral-to-butter gradient.
// Same box, radius and sizes as Avatar. The letter size comes from a token class (never an inline font size).
export function LetterAvatar({ name, size = 40, className = '' }) {
  return (
    <span className={`avatar frd-letter${size > 44 ? ' big' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="frd-letter-ch">{letterFor(name)}</span>
    </span>
  )
}

// Another person's avatar: the data URL they shared, drawn ONLY as an <img> (never markup, a background or a link),
// with the letter avatar as the fallback when there is none or the image fails to load.
export function FriendAvatar({ avatar, name, size = 40, className = '' }) {
  const [failed, setFailed] = useState(false)
  if (!isImageDataUrl(avatar) || failed) return <LetterAvatar name={name} size={size} className={className} />
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <img src={avatar} alt="" width={size} height={size} onError={() => setFailed(true)} />
    </span>
  )
}
