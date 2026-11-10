import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { getName } from '../lib/name.js'
import { Avatar } from './Avatar.jsx'

// Returning users, once per launch, right after the splash: their Nimiq Pay avatar (wallet address) and "Welcome back,
// Sam" (the name they chose, lib/name.js) over a blurred Goals screen for 1.6 s, then it fades. A tap closes it at once.
const HOLD_MS = 1600
const OUT_MS = 350

export default function WelcomeBack({ onDone }) {
  const { t, walletAddress } = useApp()
  const name = getName()
  const [out, setOut] = useState(false)
  const done = useRef(onDone)
  useEffect(() => {
    const a = setTimeout(() => setOut(true), HOLD_MS)
    const b = setTimeout(() => done.current(), HOLD_MS + OUT_MS)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [])
  const close = () => { if (out) return; setOut(true); setTimeout(() => done.current(), OUT_MS) }
  return (
    <div className={`wb${out ? ' out' : ''}`} role="status" onClick={close}>
      <div className="wb-card">
        <Avatar address={walletAddress} size={96} />
        <p className="wb-text">{name ? t('greet_back', { name }) : t('greet_back_anon')}</p>
      </div>
    </div>
  )
}
