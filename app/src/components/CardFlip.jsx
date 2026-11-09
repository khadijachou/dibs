import { useCallback, useEffect, useRef, useState } from 'react'
import { BrandLogo } from './ui.jsx'
import { playReveal } from '../lib/sound.js'

// Card flip before a navigation ("Get my card"; the redesigned unlock screens reuse it).
// The flip is decoration only: navigation never depends on it.
//   const flip = useCardFlip(() => go('redeem', { goalId }))
//   <CardFlip flip={flip} back={<GiftFace brand={brand} amount="20 USD" />}>{front}</CardFlip>
//   <button onClick={flip.start}>…</button>
// start() plays the reveal sound from the tap, ignores repeated taps, and runs onDone exactly once:
// on the flip's animationend, or after FALLBACK_MS, or at once if anything throws.
// Reduced motion: a 200 ms crossfade to the back face and the chime only.
const FALLBACK_MS = 1200
const prefersReduced = () => { try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) } catch { return false } }
const END_ANIMATIONS = new Set(['dibs-flip', 'dibs-flip-fade'])

export function useCardFlip(onDone) {
  const [run, setRun] = useState(null) // null | { reduced }
  const started = useRef(false)
  const finished = useRef(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    doneRef.current()
  }, [])
  const start = useCallback(() => {
    if (started.current) return
    started.current = true
    try {
      const reduced = prefersReduced()
      playReveal({ reduced }) // synchronous: the AudioContext starts inside the tap; never awaited
      setRun({ reduced })
    } catch {
      finish()
    }
  }, [finish])
  useEffect(() => {
    if (!run) return undefined
    const id = setTimeout(finish, FALLBACK_MS)
    return () => clearTimeout(id)
  }, [run, finish])
  return { active: Boolean(run), reduced: Boolean(run?.reduced), start, finish }
}

export function CardFlip({ flip, back, children, className = '' }) {
  const onAnimationEnd = (e) => {
    try {
      if (e.target === e.currentTarget && END_ANIMATIONS.has(e.animationName)) flip.finish()
    } catch { flip.finish() }
  }
  const state = flip.active ? (flip.reduced ? ' go rm' : ' go') : ''
  return (
    <div className={`flip-scene ${className}`}>
      <div className={`flip-card${state}`} onAnimationEnd={onAnimationEnd} aria-busy={flip.active || undefined}>
        <div className="flip-face front">{children}</div>
        <div className="flip-face back" aria-hidden={!flip.active}>{back}</div>
      </div>
    </div>
  )
}

// The back face: a gift card with the brand logo large, "{brand} · {amount}" and one sheen sweep.
export function GiftFace({ brand, label, title }) {
  return (
    <div className="gift-face">
      <BrandLogo brand={brand} className="gift-logo" />
      {label && <span className="gift-label">{label}</span>}
      <b className="gift-title">{title}</b>
    </div>
  )
}
