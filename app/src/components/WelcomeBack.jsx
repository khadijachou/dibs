import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { getName } from '../lib/name.js'
import { listGoals } from '../lib/goals.js'
import { boldParts, earnedDelta, statusLine } from '../lib/greeting.js'
import { currentEarned, previousEarned } from '../lib/lastVisit.js'
import { playWelcome } from '../lib/sound.js'
import { Avatar } from './Avatar.jsx'
import { MARK_RIBBON } from './ui.jsx'
import { goalShortName } from './WeekCard.jsx'
import { readWallet, readyFor } from './ReadyState.jsx'

// Welcome back, the Dibs way. Returning users, once per launch, right after the splash (App.jsx); first: the first-run
// "Welcome, Sam" before How Dibs works. Over a blurred Goals screen: the user's Nimiq Pay avatar pops into the hole of
// the Dibs d, the ring draws around it, the bookmark ribbon drops in, then the text. Sounds in lib/sound.js
// (playWelcome), in sync. Fades at HOLD_MS; a tap closes it at once.
//
// Timeline (ms from mount): overlay 0-300, avatar 100-550, ring 400-1000, ribbon 800-1350, title 1150, line 2 1350,
// line 3 1550 (350 each). Reduced motion: everything at once, same hold. Line 3 never waits on the chain: the earned
// figure is awaited at most 1.2 s, before the line shows.
const HOLD_MS = 3000
const OUT_MS = 350

// The mark (components/ui.jsx MARK_RING / MARK_RIBBON, 192 x 246 units) drawn at 240 px wide. The ring is a stroked
// circle so it can draw: outer radius 96 and hole 38.5 as in MARK_RING.
const SCALE = 240 / 192
const W = 240
const H = Math.round(246 * SCALE) // 308
const CX = 96
const CY = 153.5
const R = 67.25
const SW = 57.5
const LEN = 2 * Math.PI * R
const AV = 92
const DROP = -(H + 140) / SCALE // in mark units: the box height + 140 px above its place

const reducedMotion = () => { try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) } catch { return false } }

export default function WelcomeBack({ onDone, first = false }) {
  const { t, lang, walletAddress, address, prices, balance } = useApp()
  const name = getName()
  const [out, setOut] = useState(false)
  const [delta, setDelta] = useState(null)
  const [wallet, setWallet] = useState(null) // spendable NIM, for a ready or unlocking goal's line (readyState)
  const done = useRef(onDone)
  const sound = useRef(null)
  const reduced = useMemo(reducedMotion, [])

  useEffect(() => {
    sound.current = playWelcome({ first, reduced, since: performance.now() })
    const a = setTimeout(() => setOut(true), HOLD_MS)
    const b = setTimeout(() => done.current(), HOLD_MS + OUT_MS)
    let live = true
    if (!first) {
      const prev = previousEarned()
      currentEarned(1200).then((cur) => { if (live) setDelta(earnedDelta(cur, prev?.value ?? null)) })
      Promise.race([readWallet(), new Promise((r) => setTimeout(() => r(null), 1200))]).then((n) => { if (live && n != null) setWallet(n) })
    }
    return () => { live = false; clearTimeout(a); clearTimeout(b); sound.current?.stop() }
  }, [first, reduced])

  const close = () => {
    if (out) return
    sound.current?.stop()
    setOut(true)
    setTimeout(() => done.current(), OUT_MS)
  }

  const title = first ? (name ? t('greet_first', { name }) : t('greet_first_anon')) : (name ? t('greet_back', { name }) : t('greet_back_anon'))
  let line3 = null
  if (!first) {
    let goals = []
    try { goals = address ? listGoals(address) : [] } catch { /* display only */ }
    line3 = statusLine(goals, { t, lang, delta, item: (g) => goalShortName(t, g), ready: (g) => readyFor(g, { goals, prices, wallet, balance }) })
  }

  return (
    <div className={`wb${out ? ' out' : ''}`} role="status" onClick={close}>
      <div className="wb-card">
        <div className="wb-mark" style={{ width: W, height: H }}>
          <svg aria-hidden="true" viewBox="0 0 192 246" width={W} height={H} overflow="visible">
            <circle className="wb-ring" cx={CX} cy={CY} r={R} fill="none" stroke="#E8482A" strokeWidth={SW}
              strokeDasharray={LEN} style={{ '--len': LEN }}
              transform={`translate(0 ${2 * CY}) scale(1 -1) rotate(-90 ${CX} ${CY})`} />
            <polygon className="wb-ribbon" points={MARK_RIBBON} fill="#E8482A" style={{ '--drop': `${DROP}px` }} />
          </svg>
          <div className="wb-av" style={{ left: CX * SCALE - AV / 2, top: CY * SCALE - AV / 2 }}>
            <Avatar address={walletAddress} size={AV} />
          </div>
        </div>
        <div className="wb-lines">
          <p className="wb-title">{title}</p>
          {!first && <p className="wb-kept">{t('greet_kept')}</p>}
          {line3 && (
            <p className="wb-status">
              {boldParts(line3).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
