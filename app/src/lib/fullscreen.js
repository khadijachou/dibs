// Nimiq Pay full screen. A tiny store { supported, on } over the SDK's fullscreen calls.
//
// supported: getFullscreen() answered once at start (after connect() in lib/nimiq.js). Outside Nimiq Pay
// (demo, a normal browser, an older host) it rejects, supported stays false and nothing is shown.
// on: kept in sync through onFullscreenChange, and read again when the page becomes visible
// (full screen ends when the app goes to the background). html.is-fullscreen follows it.
//
// Nimiq Pay shows no prompt of its own: the app asks first, every time (components/FullscreenSheet.jsx).
import { useSyncExternalStore } from 'react'
import { exitFullscreen, getFullscreen, onFullscreenChange, requestFullscreen } from '@nimiq/mini-app-sdk'

export function createFullscreen(api, doc = globalThis.document) {
  let state = { supported: false, on: false }
  const listeners = new Set()
  let started = null

  const set = (patch) => {
    const next = { ...state, ...patch }
    if (next.supported === state.supported && next.on === state.on) return
    state = next
    try { doc?.documentElement?.classList.toggle('is-fullscreen', state.on) } catch { /* no DOM */ }
    listeners.forEach((fn) => fn())
  }

  const refresh = async () => {
    if (!state.supported) return
    try { set({ on: Boolean(await api.getFullscreen()) }) } catch { /* host busy: keep what we have */ }
  }

  const start = () => {
    if (started) return started
    started = (async () => {
      let on
      try { on = Boolean(await api.getFullscreen()) } catch { return }
      set({ supported: true, on })
      try { api.onFullscreenChange((v) => set({ on: Boolean(v) })) } catch { /* older host: visibility refresh only */ }
      try { doc?.addEventListener?.('visibilitychange', () => { if (doc.visibilityState === 'visible') refresh() }) } catch { /* no DOM */ }
    })()
    return started
  }

  // true when the host accepted. The caller has already asked the user (FullscreenSheet).
  const enter = async () => {
    if (!state.supported) return false
    try { await api.requestFullscreen() } catch { return false }
    set({ on: true })
    refresh()
    return true
  }

  const leave = async () => {
    if (!state.supported) return false
    try { await api.exitFullscreen() } catch { refresh(); return false }
    set({ on: false })
    return true
  }

  return {
    start, enter, leave, refresh,
    get: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
  }
}

export const fullscreen = createFullscreen({ getFullscreen, requestFullscreen, exitFullscreen, onFullscreenChange })
export const startFullscreen = () => fullscreen.start()

export function useFullscreen() {
  const { supported, on } = useSyncExternalStore(fullscreen.subscribe, fullscreen.get, fullscreen.get)
  return { supported, on, enter: fullscreen.enter, leave: fullscreen.leave }
}
