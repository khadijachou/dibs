// ---- Audio unlock -------------------------------------------------------------------------------------------------
// The page's one AudioContext: created on the first tap, resumed on later ones (iOS suspends it in the background,
// and after Nimiq Pay's approval sheet it can be 'interrupted'; it also caps how many a page may open). App.jsx calls
// audioContext() from a capture listener on every pointerdown / keydown, and resumeShared() when the page is visible again.
// audioContext() must be called synchronously inside the tap handler, before any state update or await,
// or the browser keeps it suspended. Sounds not started by a tap never create a context.
let shared = null
export function audioContext() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!shared || shared.state === 'closed') shared = new AC()
  if (shared.state !== 'running') shared.resume?.().catch?.(() => {})
  return shared
}

// Back to visible: wake the shared context if there is one (never a new context, failures ignored).
export function resumeShared() {
  try { if (shared && shared.state !== 'running' && shared.state !== 'closed') shared.resume?.().catch?.(() => {}) } catch { /* stay silent */ }
}

// What a sound not started by a tap may do, from the shared context's state (null: none yet) and whether the page
// has had a tap: 'play' now, 'resume' first (then play if it runs within RESUME_MS), or stay 'silent'.
export const RESUME_MS = 400
export function soundPlan(state, hasTap) {
  if (!state || state === 'closed' || !hasTap) return 'silent'
  if (state === 'running') return 'play'
  if (state === 'suspended' || state === 'interrupted') return 'resume'
  return 'silent'
}

const hasTapped = () => !navigator.userActivation || navigator.userActivation.hasBeenActive
// dibs.sound missing (a new user) = on; only 'off' silences. screens/More.jsx reads it the same way.
const soundOff = () => { try { return localStorage.getItem('dibs.sound') === 'off' } catch { return false } }
// 'ambient' follows the iPhone silent switch and mixes with other audio (intended).
const ambient = () => { if (navigator.audioSession) { try { navigator.audioSession.type = 'ambient' } catch { /* older Safari */ } } }

// Runs play(ctx) on the shared context when a tap already unlocked it: right away when running, else after resume()
// once it reports 'running', within RESUME_MS. Otherwise silent; nothing is queued for later.
function withUnlocked(play) {
  const ctx = shared
  const plan = soundPlan(ctx?.state || null, hasTapped())
  if (plan === 'silent') return
  if (plan === 'play') { play(ctx); return }
  const deadline = performance.now() + RESUME_MS
  let done = false
  const check = () => {
    if (done) return
    if (ctx.state === 'running') { done = true; try { play(ctx) } catch { /* stay silent */ } return }
    if (performance.now() < deadline) setTimeout(check, 25)
    else done = true
  }
  try { ctx.resume?.().then?.(check, () => {}) } catch { /* poll only */ }
  check()
}

// The "Dibs!" stamp pop: a short synthesised sound, no audio file. Plays whatever the motion setting (reduced motion
// changes animations, not sound); silent when dibs.sound === 'off'. Never throws.
// From a tap (default): on the shared context, created or resumed here, inside the tap.
// ifUnlocked: for a pop not started by a tap (e.g. the release arriving while the page is open): plays only when an
// earlier tap unlocked audio, resuming the context first when needed (withUnlocked).
function schedulePop(ctx) {
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
  osc.onended = () => { try { gain.disconnect() } catch { /* already gone */ } }
  osc.start(t0)
  osc.stop(t0 + 0.16)
}
export function playPop({ ifUnlocked = false } = {}) {
  try {
    if (soundOff()) return
    ambient()
    if (ifUnlocked) { withUnlocked(schedulePop); return }
    const ctx = audioContext()
    if (ctx) schedulePop(ctx)
  } catch { /* no audio: stay silent */ }
}

// "Card revealed": synced with CardFlip. A soft rising whoosh while the card turns (filtered noise,
// 0.10 to 0.50 s), then a bright rising C major arpeggio as the back face lands (0.50 to 0.98 s).
// reduced: chime only, right away (the crossfade replaces the turn).
// Same rules as the pop: start from the tap (the shared AudioContext is created or resumed synchronously here), 'ambient'
// audio session, silent when dibs.sound === 'off', never throws, never awaited by the caller.
export function playReveal({ reduced = false } = {}) {
  try {
    if (soundOff()) return
    ambient()
    const ctx = audioContext()
    if (!ctx) return
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
    // Shared context: left open for the next reveal; the nodes end on their own. Disconnect the bus when done.
    setTimeout(() => { try { out.disconnect() } catch { /* already gone */ } }, Math.ceil((end - ctx.currentTime) * 1000) + 200)
  } catch { /* no audio: stay silent */ }
}

// Welcome back (components/WelcomeBack.jsx), synced with its animation. Times from the overlay's mount:
// a) avatar pop 0.10 s, b) ring whoosh 0.40 to 1.02 s, c) bookmark lands 1.12 s, d) chime with line 2 at 1.35 s
// (first run: with the title at 1.15 s, there is no line 2). reduced: the chime only, right away.
// scheduleWelcome draws on any context (also an OfflineAudioContext, to check levels); returns when the last sound ends.
// Sounds already more than 80 ms in the past are skipped; slightly late ones play at once.
// Whoosh peak: the card reveal uses 0.09, but measured offline (OfflineAudioContext) that left this whoosh 15 dB under the pop;
// 0.2 puts it about 8 dB under (RMS), just below the pop and the landing.
export const WELCOME_WHOOSH_PEAK = 0.2
export function scheduleWelcome(ctx, bus, t0, { first = false, reduced = false, now = ctx.currentTime } = {}) {
  let end = now
  const when = (offset) => {
    const at = t0 + offset
    if (at < now - 0.08) return null
    return Math.max(at, now + 0.005)
  }
  const env = (g, at, attack, peak, decayEnd) => {
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(peak, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + decayEnd)
  }
  const tone = (at, { type = 'sine', f0, f1 = null, glide = 0, attack, peak, decay }) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, at)
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + glide)
    env(g, at, attack, peak, decay)
    o.connect(g).connect(bus)
    o.start(at)
    o.stop(at + decay + 0.02)
    end = Math.max(end, at + decay + 0.02)
  }
  const noise = (len) => {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    return src
  }
  const chime = (at) => {
    ;[[783.99, 0], [1046.5, 0.12]].forEach(([f, d]) => {
      tone(at + d, { f0: f, attack: 0.012, peak: 0.11, decay: 0.55 })
      tone(at + d, { type: 'triangle', f0: f * 2, attack: 0.012, peak: 0.022, decay: 0.4 })
    })
  }

  if (reduced) { chime(now + 0.02); return end }

  // a) avatar pop
  let at = when(0.10)
  if (at != null) tone(at, { f0: 880, f1: 220, glide: 0.09, attack: 0.008, peak: 0.22, decay: 0.14 })

  // b) ring whoosh: white noise, band-pass sweeping 300 -> 1800 Hz, swelling to 0.40 s then gone by 0.62 s.
  at = when(0.40)
  if (at != null) {
    const len = 0.62
    const src = noise(len)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.1
    bp.frequency.setValueAtTime(300, at)
    bp.frequency.exponentialRampToValueAtTime(1800, at + len)
    const g = ctx.createGain()
    env(g, at, 0.40, WELCOME_WHOOSH_PEAK, len)
    src.connect(bp).connect(g).connect(bus)
    src.start(at)
    src.stop(at + len)
    end = Math.max(end, at + len)
  }

  // c) bookmark lands: a low thud and a short noise tick.
  at = when(1.12)
  if (at != null) {
    tone(at, { f0: 170, f1: 80, glide: 0.09, attack: 0.004, peak: 0.42, decay: 0.13 })
    const src = noise(0.02)
    const g = ctx.createGain()
    env(g, at, 0.002, 0.05, 0.02)
    src.connect(g).connect(bus)
    src.start(at)
    src.stop(at + 0.02)
  }

  // d) chime: G5 then C6
  at = when(first ? 1.15 : 1.35)
  if (at != null) chime(at)
  return end
}

// Plays the Welcome sounds on the shared context. Never throws, never awaited. Audio needs a tap first: when the
// context is not running within 150 ms (no earlier tap at this launch), it stays silent; nothing is queued for later.
// since: performance.now() when the overlay mounted, so the sounds stay in sync after the wait.
// Returns { stop() }: ramps the bus to 0 in 80 ms (tap to close).
export function playWelcome({ first = false, reduced = false, since = performance.now() } = {}) {
  let stopped = false
  let bus = null
  let ctx = null
  const handle = {
    stop() {
      stopped = true
      try {
        if (!bus || !ctx) return
        const n = ctx.currentTime
        bus.gain.cancelScheduledValues(n)
        bus.gain.setValueAtTime(bus.gain.value, n)
        bus.gain.linearRampToValueAtTime(0, n + 0.08)
        const b = bus
        setTimeout(() => { try { b.disconnect() } catch { /* already gone */ } }, 200)
      } catch { /* stay silent */ }
    },
  }
  try {
    if (soundOff()) return handle
    ambient()
    ctx = audioContext()
    if (!ctx) return handle
    const go = () => {
      if (stopped) return
      try {
        bus = ctx.createGain()
        bus.gain.value = 0.9
        bus.connect(ctx.destination)
        const t0 = ctx.currentTime - (performance.now() - since) / 1000
        const end = scheduleWelcome(ctx, bus, t0, { first, reduced, now: ctx.currentTime })
        const b = bus
        setTimeout(() => { try { b.disconnect() } catch { /* already gone */ } }, Math.ceil((end - ctx.currentTime) * 1000) + 200)
      } catch { /* stay silent */ }
    }
    if (ctx.state === 'running') go()
    else {
      const deadline = performance.now() + 150
      const poll = () => {
        if (stopped) return
        if (ctx.state === 'running') return go()
        if (performance.now() < deadline) setTimeout(poll, 15)
      }
      poll()
    }
  } catch { /* no audio: stay silent */ }
  return handle
}

// ---- Small sounds: NIM added, milestone, goal complete, badge / quest -------------------------------------------------
// Same rules as playReveal (shared context, 'ambient', silent when dibs.sound === 'off', never throws, never awaited),
// but they never unlock audio themselves: they play only when a tap in this session already did (the shared context
// exists), resuming it first when suspended or interrupted (withUnlocked). Otherwise silent.
// One note: oscillator -> envelope (exponential attack, then decay to silence by `decay` s after `at`) -> out.
// tremolo: [rate Hz, depth 0..1] for the shimmer. Returns when it ends.
function note(ctx, out, at, { f, f1 = null, glide = 0, type = 'sine', peak, attack, decay, tremolo = null }) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, at)
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + glide)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  let last = o.connect(g)
  const extra = []
  if (tremolo) {
    const [rate, depth] = tremolo
    const trem = ctx.createGain()
    trem.gain.value = 1 - depth
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = rate
    lfoGain.gain.value = depth
    lfo.connect(lfoGain).connect(trem.gain)
    last = last.connect(trem)
    extra.push(lfo)
  }
  last.connect(out)
  const stop = at + decay + 0.02
  ;[o, ...extra].forEach((n) => { n.start(at); n.stop(stop) })
  return stop
}

// The sounds as builders (ctx, out, t0) -> end time, so they can also be rendered offline.
export const SOUNDS = {
  // NIM added: two short bell strikes, C7 then G7 40 ms later, each with an inharmonic partial at 2.76x.
  clink(ctx, out, t0) {
    return Math.max(
      note(ctx, out, t0, { f: 2093, peak: 0.14, attack: 0.004, decay: 0.22 }),
      note(ctx, out, t0, { f: 2093 * 2.76, peak: 0.03, attack: 0.004, decay: 0.08 }),
      note(ctx, out, t0 + 0.04, { f: 3136, peak: 0.11, attack: 0.004, decay: 0.30 }),
      note(ctx, out, t0 + 0.04, { f: 3136 * 2.76, peak: 0.02, attack: 0.004, decay: 0.07 }),
    )
  },
  // 25, 50 or 75 %: E6, G6, C7, 65 ms apart, each with a soft triangle octave.
  milestone(ctx, out, t0) {
    let end = t0
    ;[1318.5, 1568, 2093].forEach((f, i) => {
      const at = t0 + i * 0.065
      end = Math.max(end,
        note(ctx, out, at, { f, peak: 0.10, attack: 0.01, decay: 0.42 }),
        note(ctx, out, at, { f: f * 2, type: 'triangle', peak: 0.02, attack: 0.01, decay: 0.3 }))
    })
    return end
  },
  // 100 %: a quick run G5 C6 E6 G6, landing at 0.22 s on a held C major chord (C6 E6 G6 C7, each doubled 0.3 % sharp
  // at half volume, plus a triangle octave at 18 %), a soft shimmer (C8, G7 with tremolo) and a low bloom. About 1.6 s.
  goalDone(ctx, out, t0) {
    let end = t0
    ;[783.99, 1046.5, 1318.5, 1568].forEach((f, i) => {
      end = Math.max(end, note(ctx, out, t0 + i * 0.055, { f, peak: 0.075, attack: 0.006, decay: 0.22 }))
    })
    const land = t0 + 0.22
    ;[[1046.5, 0.07], [1318.5, 0.06], [1568, 0.06], [2093, 0.05]].forEach(([f, v]) => {
      end = Math.max(end,
        note(ctx, out, land, { f, peak: v, attack: 0.015, decay: 1.35 }),
        note(ctx, out, land, { f: f * 1.003, peak: v / 2, attack: 0.015, decay: 1.35 }),
        note(ctx, out, land, { f: f * 2, type: 'triangle', peak: v * 0.18, attack: 0.015, decay: 1.35 }))
    })
    end = Math.max(end,
      note(ctx, out, land, { f: 4186, peak: 0.02, attack: 0.015, decay: 1.0, tremolo: [9, 0.5] }),
      note(ctx, out, land, { f: 3136, peak: 0.015, attack: 0.015, decay: 1.0, tremolo: [7, 0.5] }),
      note(ctx, out, land, { f: 130, f1: 65, glide: 0.25, peak: 0.12, attack: 0.02, decay: 0.45 }))
    return end
  },
  // Badge earned band, Quest done toast: A6 with a triangle octave, then E7 80 ms later.
  ting(ctx, out, t0) {
    return Math.max(
      note(ctx, out, t0, { f: 1760, peak: 0.12, attack: 0.006, decay: 0.8 }),
      note(ctx, out, t0, { f: 3520, type: 'triangle', peak: 0.025, attack: 0.006, decay: 0.5 }),
      note(ctx, out, t0 + 0.08, { f: 2637, peak: 0.06, attack: 0.006, decay: 0.6 }),
    )
  },
}

function playIfUnlocked(build) {
  try {
    if (soundOff()) return
    ambient()
    withUnlocked((ctx) => {
      const out = ctx.createGain()
      out.gain.value = 0.9
      out.connect(ctx.destination)
      const end = build(ctx, out, ctx.currentTime + 0.01)
      setTimeout(() => { try { out.disconnect() } catch { /* already gone */ } }, Math.ceil((end - ctx.currentTime) * 1000) + 200)
    })
  } catch { /* no audio: stay silent */ }
}

export const playClink = () => playIfUnlocked(SOUNDS.clink)
export const playMilestone = () => playIfUnlocked(SOUNDS.milestone)
export const playGoalDone = () => playIfUnlocked(SOUNDS.goalDone)
export const playTing = () => playIfUnlocked(SOUNDS.ting)

// One sound per deposit, from the goal's progress (0..1) before and after it: 100 % > a 25/50/75 % mark > the clink.
export function depositSound(before, after) {
  if (before < 1 && after >= 1) return 'goalDone'
  if ([0.25, 0.5, 0.75].some((m) => before < m && after >= m)) return 'milestone'
  return 'clink'
}
export function playDeposit(before, after) {
  const k = depositSound(before, after)
  if (k === 'goalDone') playGoalDone()
  else if (k === 'milestone') playMilestone()
  else playClink()
}
