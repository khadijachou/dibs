// Display-only count-up. The real value stays the source of truth for every check.
// Animates only when the value changes, 900 ms, never from 0 on first render.
// Off with prefers-reduced-motion. A null / non-number on either side snaps (no count from 0).
import { useEffect, useRef, useState } from 'react'

export function useCountUp(value, ms = 900) {
  const [shown, setShown] = useState(value)
  const cur = useRef(value) // what is on screen right now, so a change mid-animation starts from there
  useEffect(() => {
    const a = cur.current; const b = value
    if (a === b) return
    const reduce = typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || !Number.isFinite(a) || !Number.isFinite(b)) { cur.current = b; setShown(b); return }
    const start = performance.now()
    let raf
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms); const e = 1 - Math.pow(1 - p, 3)
      const v = p < 1 ? a + (b - a) * e : b
      cur.current = v; setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

// Use: const savedShown = useCountUp(p.saved); <span>{fmtNim(Math.round(savedShown), lang)} NIM</span>
