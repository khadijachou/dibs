import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { connect, getBalanceNim, host, isDemo, listAccountsWithBalance } from './lib/nimiq.js'
import { getPrices } from './lib/price.js'
import { makeT } from './lib/i18n.js'
import { adoptGoals, getGoal } from './lib/goals.js'
import { loadCatalog } from './lib/catalog.js'
import { readSimulateParam } from './lib/errors.js'
import Home from './screens/Home.jsx'
import Catalog from './screens/Catalog.jsx'
import Plan from './screens/Plan.jsx'
import Goal from './screens/Goal.jsx'
import Unlock from './screens/Unlock.jsx'
import Redeem from './screens/Redeem.jsx'
import Done from './screens/Done.jsx'
import Lab from './screens/Lab.jsx'
import Splash from './screens/Splash.jsx'
import Onboarding from './screens/Onboarding.jsx'
import Stake from './screens/Stake.jsx'
import History from './screens/History.jsx'
import More from './screens/More.jsx'
import Profile from './screens/Profile.jsx'
import Browse from './screens/Browse.jsx'
import { TabBar, TAB_ROUTES } from './components/ui.jsx'

// The Lab (#lab) is a developer screen: only in demo mode or in a build made with VITE_LAB=1.
const labAllowed = () => import.meta.env.VITE_LAB === '1' || isDemo()

const LANGS = ['en', 'fr', 'es']
const readLang = () => { try { const l = localStorage.getItem('dibs.lang'); return LANGS.includes(l) ? l : null } catch { return null } }
const hostLang = () => { try { const l = String(host.language() || '').slice(0, 2).toLowerCase(); return LANGS.includes(l) ? l : 'en' } catch { return 'en' } }

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

const SCREENS = { home: Home, catalog: Catalog, plan: Plan, goal: Goal, unlock: Unlock, redeem: Redeem, done: Done, stake: Stake, history: History, profile: Profile, more: More, browse: Browse }

// Back with nothing behind (after a reload, or a screen opened with reset): where each screen goes.
// Goals (home) has no parent: back from there leaves the app.
const HOME = { name: 'home', params: {} }
function parentOf(route) {
  const goalId = route.params?.goalId
  if (route.name === 'home') return null
  if (route.name === 'browse') return { name: 'more', params: {} }
  if (route.name === 'plan') return { name: 'catalog', params: route.params?.changeFor ? { changeFor: route.params.changeFor } : {} }
  if ((route.name === 'unlock' || route.name === 'redeem') && goalId) return { name: 'goal', params: { goalId } }
  return HOME
}

// The screen in history.state survives a reload. One-shot params (the Dibs! stamp, a preset amount) are dropped,
// and a screen whose goal is gone falls back to Goals.
function restoredRoute(state, address) {
  const r = state?.dibs && state.route
  if (!r || !SCREENS[r.name]) return HOME
  const { created, amount, moveFrom, ...params } = r.params || {} // eslint-disable-line no-unused-vars
  if (params.goalId && !getGoal(address, params.goalId)) return HOME
  return { name: r.name, params }
}

// Screens with a Nimiq Pay request open call this: Android back does nothing until it closes.
export function useBlockBack(active) {
  const { blockBack } = useApp()
  useEffect(() => (active ? blockBack() : undefined), [active, blockBack])
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState(null)
  const [address, setAddress] = useState(null)
  const [balance, setBalance] = useState(null)
  const [prices, setPrices] = useState(null)
  const [route, setRoute] = useState({ name: 'home', params: {} })
  const [history, setHistory] = useState([])
  const [toastText, setToastText] = useState(null)
  const toast = useCallback((text) => { setToastText(text); clearTimeout(window.__dibsToast); window.__dibsToast = setTimeout(() => setToastText(null), 4000) }, [])
  const [labHash, setLabHash] = useState(() => location.hash === '#lab')
  const isLab = labHash && labAllowed()
  // Language: the user's choice (dibs.lang) wins, else Nimiq Pay's language, else en.
  const [langPick, setLangPick] = useState(readLang)
  const lang = useMemo(() => langPick || hostLang(), [langPick, ready])
  const t = useMemo(() => makeT(lang), [lang])
  const setLang = useCallback((l) => {
    if (!LANGS.includes(l)) return
    try { localStorage.setItem('dibs.lang', l) } catch { /* private mode */ }
    setLangPick(l)
  }, [])
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  // Landing: splash at least 900 ms, onboarding on first run without waiting for the wallet.
  const [onboarded, setOnboarded] = useState(() => { try { return localStorage.getItem('dibs.onboarded') === '1' } catch { return false } })
  const [splashMin, setSplashMin] = useState(false)
  const [splashGone, setSplashGone] = useState(false)
  const hideSplash = useCallback(() => setSplashGone(true), [])
  useEffect(() => { const id = setTimeout(() => setSplashMin(true), 900); return () => clearTimeout(id) }, [])
  const finishOnboarding = useCallback(() => {
    try { localStorage.setItem('dibs.onboarded', '1') } catch { /* private mode */ }
    setOnboarded(true)
    window.scrollTo(0, 0)
  }, [])
  // More > How it works: the same three slides, reopened over the app.
  const [howTo, setHowTo] = useState(false)
  const showHowTo = useCallback(() => { setHowTo(true); window.scrollTo(0, 0) }, [])
  const closeHowTo = useCallback(() => { setHowTo(false); window.scrollTo(0, 0) }, [])

  const refreshBalance = useCallback(async (addr = address) => {
    if (!addr) return
    try { setBalance(await getBalanceNim(addr)) } catch { /* older hosts: no getBalance */ }
  }, [address])

  const start = useCallback(async () => {
    setFatal(null)
    try {
      await connect()
      readSimulateParam() // ?sim works in demo mode only, so read it once we know the mode
      const accounts = await listAccountsWithBalance()
      const funded = accounts.filter((a) => a.nim > 0).sort((a, b) => b.nim - a.nim)
      const addr = (funded[0] || accounts[0]).address
      adoptGoals(addr)
      setAddress(addr)
      refreshBalance(addr)
      await loadCatalog()
      getPrices().then(setPrices)
      // Home shows the welcome screen to new users and the hub to returning ones (UI v2.2).
      // After a reload, the screen that was open comes back (its back goes to the screen's parent).
      setRoute(restoredRoute(window.history.state, addr))
      setHistory([])
      setReady(true)
    } catch (e) {
      setFatal(e)
    }
  }, [refreshBalance])

  useEffect(() => { start() }, [start])
  useEffect(() => {
    const onHash = () => setLabHash(location.hash === '#lab')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((name, params = {}) => {
    setHistory((h) => [...h, route])
    setRoute({ name, params })
    window.scrollTo(0, 0)
  }, [route])
  // While a Nimiq Pay request is open (deposit, unlock step, payment), back is blocked: counter of open requests.
  const blocks = useRef(0)
  const blockBack = useCallback(() => {
    blocks.current += 1
    let done = false
    return () => { if (!done) { done = true; blocks.current -= 1 } }
  }, [])
  // The previous screen, or the screen's parent when nothing is behind it. False when there is nowhere to go.
  const back = useCallback(() => {
    if (blocks.current > 0) return false
    const prev = history.at(-1)
    const target = prev || parentOf(route)
    if (!target) return false
    if (prev) setHistory(history.slice(0, -1))
    setRoute(target)
    window.scrollTo(0, 0)
    return true
  }, [history, route])
  // A screen opened with reset sits on top of Goals: back from a tab, Done or a new goal goes to Goals.
  const reset = useCallback((name = 'home', params = {}) => { setHistory(name === 'home' ? [] : [HOME]); setRoute({ name, params }) }, [])
  const canGoBack = history.length > 0 || Boolean(parentOf(route))

  // Android back button. The page keeps at most two browser entries: a base entry, plus a guard entry on top of it
  // whenever the app has somewhere to go back to. Back pops the guard; the app moves back one screen and puts the
  // guard back if needed. On Goals with nothing behind, there is no guard, so back leaves the app as usual.
  // history.state also carries the current screen, so a reload reopens it.
  const guarded = useRef(false)
  const ignorePop = useRef(false)
  const backRef = useRef(back)
  backRef.current = back
  const routeRef = useRef(route)
  routeRef.current = route
  useEffect(() => {
    if (!ready) return
    const h = window.history
    if (h.state?.dibs === 'guard') guarded.current = true // reloaded on a guard entry
    if (canGoBack && !guarded.current) { h.pushState({ dibs: 'guard', route }, ''); guarded.current = true }
    else if (!canGoBack && guarded.current) { ignorePop.current = true; guarded.current = false; h.back(); return }
    h.replaceState({ dibs: guarded.current ? 'guard' : 'base', route }, '')
  }, [ready, route, canGoBack])
  useEffect(() => {
    const onPop = () => {
      if (ignorePop.current) {
        ignorePop.current = false
        window.history.replaceState({ dibs: 'base', route: HOME }, '')
        return
      }
      guarded.current = false // the guard entry was just popped
      if (!backRef.current()) {
        // Blocked while a Nimiq Pay request is open: stay on this screen, guard again.
        if (blocks.current > 0) { window.history.pushState({ dibs: 'guard', route: routeRef.current }, ''); guarded.current = true }
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const ctx = { t, lang, setLang, address, balance, refreshBalance, prices, demo: isDemo(), go, back, reset, toast, showHowTo, canGoBack, blockBack }

  // The launch splash leaves (ring completes, then fades) once the next screen is ready to show.
  const splashDone = splashMin && (ready || Boolean(fatal) || (!onboarded && !isLab))
  if (!splashGone) return <AppCtx.Provider value={ctx}><Splash done={splashDone} onGone={hideSplash} /></AppCtx.Provider>
  if (!onboarded && !isLab) return <AppCtx.Provider value={ctx}><Onboarding onDone={finishOnboarding} /></AppCtx.Provider>
  if (fatal) {
    return (
      <AppCtx.Provider value={ctx}>
        <div className="app"><div className="screen center" style={{ justifyContent: 'center' }}>
          <p className="sub">{t('noAccount')}</p>
          <p className="small">{fatal.message}</p>
          <button type="button" className="btn" onClick={start}>{t('retry')}</button>
        </div></div>
      </AppCtx.Provider>
    )
  }
  if (!ready) {
    return <AppCtx.Provider value={ctx}><Splash /></AppCtx.Provider>
  }

  if (howTo && !isLab) return <AppCtx.Provider value={ctx}><Onboarding replay onDone={closeHowTo} /></AppCtx.Provider>

  const Screen = isLab ? Lab : SCREENS[route.name] || Home
  // Tab bar on the four top-level screens only, never on flows (Plan, Goal, Unlock, Redeem, Done) or the Lab.
  const tabs = !isLab && TAB_ROUTES.includes(route.name)
  return (
    <AppCtx.Provider value={ctx}>
      <div className={`app${tabs ? ' with-tabs' : ''}`}><Screen {...route.params} />{tabs && <TabBar current={route.name} />}{toastText && <div className="toast" role="status"><i>i</i>{toastText}</div>}</div>
    </AppCtx.Provider>
  )
}
