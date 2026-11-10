import { useEffect, useState } from 'react'

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

export function Avatar({ address, size = 56, className = '', fallback = null }) {
  const key = address ? friendly(address) : null
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
