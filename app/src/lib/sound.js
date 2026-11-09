// The "Dibs!" stamp pop: a short synthesised sound, no audio file.
// Call it only from the user's tap (browsers, iOS above all, need a gesture to start audio).
// Silent under reduced motion or when localStorage dibs.sound === 'off'. Never throws.
// ifUnlocked: for a pop that is not started by a tap (e.g. the release arriving while the page is open).
// Plays only when an earlier tap already unlocked audio for this page; otherwise stays silent.
export function playPop({ ifUnlocked = false } = {}) {
  try {
    try { if (localStorage.getItem('dibs.sound') === 'off') return } catch { /* private mode: play */ }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // 'ambient' follows the iPhone silent switch and mixes with other audio.
    if (navigator.audioSession) { try { navigator.audioSession.type = 'ambient' } catch { /* older Safari */ } }
    if (ifUnlocked && navigator.userActivation && !navigator.userActivation.hasBeenActive) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    if (ifUnlocked && ctx.state !== 'running') { ctx.close?.().catch?.(() => {}); return }
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

// "Card revealed": synced with CardFlip. A soft rising whoosh while the card turns (filtered noise,
// 0.10 to 0.50 s), then a bright rising C major arpeggio as the back face lands (0.50 to 0.98 s).
// reduced: chime only, right away (the crossfade replaces the turn).
// Same rules as the pop: start from the tap (the AudioContext is created synchronously here), 'ambient'
// audio session, silent when dibs.sound === 'off', never throws, never awaited by the caller.
export function playReveal({ reduced = false } = {}) {
  try {
    try { if (localStorage.getItem('dibs.sound') === 'off') return } catch { /* private mode: play */ }
    if (navigator.audioSession) { try { navigator.audioSession.type = 'ambient' } catch { /* older Safari */ } }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    ctx.resume?.().catch?.(() => {})
    const t0 = ctx.currentTime + 0.01
    const out = ctx.createGain()
    out.gain.value = 0.9
    out.connect(ctx.destination)
    let end = t0

    if (!reduced) {
      // Whoosh: white noise through a band-pass sweeping up, swelling then fading.
      const len = 0.42
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = 1.2
      const ws = t0 + 0.1
      bp.frequency.setValueAtTime(350, ws)
      bp.frequency.exponentialRampToValueAtTime(2600, ws + len)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, ws)
      g.gain.exponentialRampToValueAtTime(0.09, ws + len * 0.6)
      g.gain.exponentialRampToValueAtTime(0.0001, ws + len)
      noise.connect(bp).connect(g).connect(out)
      noise.start(ws)
      noise.stop(ws + len)
      end = ws + len
    }

    // Chime: C6, E6, G6, 70 ms apart, sine with a soft octave partial, short exponential decay.
    const cs = reduced ? t0 + 0.02 : t0 + 0.5
    ;[1046.5, 1318.5, 1568].forEach((f, i) => {
      const at = cs + i * 0.07
      const dur = i === 2 ? 0.3 : 0.24 // last note ends at 0.96 s
      for (const [mult, vol, type] of [[1, 0.11, 'sine'], [2, 0.025, 'triangle']]) {
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = type
        o.frequency.setValueAtTime(f * mult, at)
        g.gain.setValueAtTime(0.0001, at)
        g.gain.exponentialRampToValueAtTime(vol, at + 0.012)
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        o.connect(g).connect(out)
        o.start(at)
        o.stop(at + dur + 0.02)
      }
      end = Math.max(end, at + dur + 0.02)
    })
    setTimeout(() => { try { ctx.close() } catch { /* already closed */ } }, Math.ceil((end - ctx.currentTime) * 1000) + 200)
  } catch { /* no audio: stay silent */ }
}
