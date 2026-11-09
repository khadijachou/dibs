// The "Dibs!" stamp pop: a short synthesised sound, no audio file.
// Call it only from the user's tap (browsers, iOS above all, need a gesture to start audio).
// Silent under reduced motion or when localStorage dibs.sound === 'off'. Never throws.
export function playPop() {
  try {
    try { if (localStorage.getItem('dibs.sound') === 'off') return } catch { /* private mode: play */ }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // 'ambient' follows the iPhone silent switch and mixes with other audio.
    if (navigator.audioSession) { try { navigator.audioSession.type = 'ambient' } catch { /* older Safari */ } }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const t0 = ctx.currentTime + 0.01
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, t0)
    osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.09)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14)
    osc.connect(gain).connect(ctx.destination)
    osc.onended = () => { try { ctx.close() } catch { /* already closed */ } }
    ctx.resume?.().catch?.(() => {})
    osc.start(t0)
    osc.stop(t0 + 0.16)
  } catch { /* no audio: stay silent */ }
}
