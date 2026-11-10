import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { startFullscreen } from './lib/fullscreen.js'
import { initLastVisit, recordEarned } from './lib/lastVisit.js'
import { connect, getBalanceNim, host, isDemo, listAccountsWithBalance, readStaker } from './lib/nimiq.js'
import { configureStats, dailyDue, flush, markDaily, snapshotData, track } from './lib/stats.js'
import { stakeSummary } from './lib/earned.js'
import { getPrices } from './lib/price.js'
import { makeT } from './lib/i18n.js'
import { adoptGoals, getGoal, listGoals } from './lib/goals.js'
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
import Legal from './screens/Legal.jsx'
import { TabBar, TAB_ROUTES } from './components/ui.jsx'
import { preloadAvatar } from './components/Avatar.jsx'
import WelcomeBack from './components/WelcomeBack.jsx'
import HowItWorks from './components/HowItWorks.jsx'
import BadgeStamp from './components/BadgeStamp.jsx'
import { check as checkBadges, getBadges, setShared, shareEarns } from './lib/badges.js'
import { addSharedId, levelOf, rankOf, recordVisit, xpSummary } from './lib/xp.js'
import { checkQuest } from './lib/quests.js'
import { shareBadge as sharePoster } from './lib/poster.js'
import { getName } from './lib/name.js'

// The Lab (#lab) is a developer screen: only in demo mode or in a build made with VITE_LAB=1.
const labAllowed = () => import.meta.env.VITE_LAB === '1' || isDemo()

const LANGS = ['en', 'fr', 'es']
const readLang = () => { try { const l = localStorage.getItem('dibs.lang'); return LANGS.includes(l) ? l : null } catch { return null } }
const hostLang = () => { try { const l = String(host.language() || '').slice(0, 2).toLowerCase(); return LANGS.includes(l) ? l : 'en' } catch { return 'en' } }

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

const SCREENS = { home: Home, catalog: Catalog, plan: Plan, goal: Goal, unlock: Unlock, redeem: Redeem, done: Done, stake: Stake, history: History, profile: Profile, more: More, browse: Catalog, legal: Legal }

// Back with nothing behind (after a reload, or a screen opened with reset): where each screen goes.
// Goals (home) has no parent: back from there leaves the app.
const HOME = { name: 'home', params: {} }
function parentOf(route) {
  const goalId = route.params?.goalId
  if (route.name === 'home') return null
  if (route.name === 'browse') return { name: 'more', params: {} }
  if (route.name === 'legal') return { name: 'more', params: {} }
  if (route.name === 'plan') return { name: 'catalog', params: route.params?.changeFor ? { changeFor: route.params.changeFor } : {} }
  if ((route.name === 'unlock' || route.name === 'redeem') && goalId) return { name: 'goal', params: { goalId } }
  return HOME
}

// The screen in history.state survives a reload. One-shot params (the Dibs! stamp, a preset amount) are dropped,
// and a screen whose goal is gone falls back to Goals.
function restoredRoute(state, address) {
  const r = state?.dibs && state.route
  if (!r || !SCREENS[r.name]) return HOME
  const { created, amount, moveFrom, badge, badgeAt, ...params } = r.params || {} // eslint-disable-line no-unused-vars
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
  const [walletAddress, setWalletAddress] = useState(null) // listAccounts()[0]: stable, unlike the funded HTLC address
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
  // Welcome back: only for users who were already onboarded when the app opened, once per launch.
  const [welcome, setWelcome] = useState(() => { try { return localStorage.getItem('dibs.onboarded') === '1' } catch { return false } })
  const endWelcome = useCallback(() => setWelcome(false), [])
  // A launch that reopens another screen (a payment in progress, a goal) skips it: never shown later in the session.
  useEffect(() => { if (ready && splashGone && route.name !== 'home') setWelcome(false) }, [ready, splashGone]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = setTimeout(() => setSplashMin(true), 900); return () => clearTimeout(id) }, [])
  // First run: right after the slides and the name step, "Welcome, {name}" then How Dibs works, once ever.
  const [intro, setIntro] = useState(null) // null | 'welcome' | 'steps'
  const endIntroWelcome = useCallback(() => setIntro('steps'), [])
  const endIntro = useCallback(() => { setIntro(null); window.scrollTo(0, 0) }, [])
  const finishOnboarding = useCallback(() => {
    try { localStorage.setItem('dibs.onboarded', '1') } catch { /* private mode */ }
    let seen = false
    try { seen = localStorage.getItem('dibs.introSeen') === '1' } catch { /* private mode */ }
    if (!seen) setIntro('welcome')
    setOnboarded(true)
    window.scrollTo(0, 0)
  }, [])
  // More > How it works: the same three slides, reopened over the app.
  const [howTo, setHowTo] = useState(false)
  const showHowTo = useCallback(() => { setHowTo(true); window.scrollTo(0, 0) }, [])
  const closeHowTo = useCallback(() => { setHowTo(false); window.scrollTo(0, 0) }, [])

  // Badges (lib/badges.js): checked on the phone when the app is ready, after each route change, after refreshBalance
  // and when the goal ledger changes. New ones queue for the stamp (components/BadgeStamp.jsx), one at a time.
  const [stamps, setStamps] = useState([])
  const addressRef = useRef(null)
  addressRef.current = address
  const earnedCache = useRef({ address: null, at: 0, value: null })
  const runBadgeCheck = useCallback(async () => {
    const addr = addressRef.current
    if (!addr) return
    const c = earnedCache.current
    // The earned figure the app already reads (Stake, Profile), read from the chain at most once a minute here.
    if (c.address !== addr || Date.now() - c.at > 60_000) {
      c.address = addr
      c.at = Date.now()
      try {
        c.value = stakeSummary(await readStaker(addr), addr).earned
        recordEarned(c.value) // Welcome back: earned since the last visit (lib/lastVisit.js)
      } catch { /* chain unreadable: keep the last figure */ }
    }
    const ids = await checkBadges({ goals: listGoals(addr), earnedNim: c.value ?? 0 })
    if (ids.length) setStamps((q) => [...q, ...ids.filter((id) => !q.includes(id))])
    // Quest of the week (lib/quests.js): picked at the first check of the week; a toast the first time it is done.
    try { if (checkQuest(listGoals(addr)).justDone) toastRef.current?.(tRef.current('quest_done_toast')) } catch { /* display only */ }
  }, [])
  const toastRef = useRef(null)
  const tRef = useRef(null)
  const badgeCheckRef = useRef(runBadgeCheck)
  badgeCheckRef.current = runBadgeCheck

  const refreshBalance = useCallback(async (addr = address) => {
    if (!addr) return
    try { setBalance(await getBalanceNim(addr)) } catch { /* older hosts: no getBalance */ }
    badgeCheckRef.current()
  }, [address])

  const start = useCallback(async () => {
    setFatal(null)
    initLastVisit() // the last visit's earned figure, read before this launch writes it
    try {
      await connect()
      startFullscreen() // supported only inside Nimiq Pay; never blocks the start
      configureStats({ demo: isDemo() })
      readSimulateParam() // ?sim works in demo mode only, so read it once we know the mode
      const accounts = await listAccountsWithBalance()
      const wallet = accounts[0]?.address || null
      setWalletAddress(wallet)
      preloadAvatar(wallet) // the Welcome back avatar is drawn before the splash leaves
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

  // Usage stats (only with consent, see lib/stats.js): once a day app_open and the Stake tab's own numbers,
  // and whatever an earlier open could not send. Read only; never waits on anything.
  useEffect(() => {
    if (!ready || !address) return
    recordVisit() // XP and the weekly rhythm (lib/xp.js): one entry per local day, on this phone only
    if (dailyDue('open')) { track('app_open', { lang }); markDaily('open') } else flush()
    if (!dailyDue('snapshot')) return
    readStaker(address).then((st) => {
      const goalsActive = listGoals(address).filter((g) => g.status !== 'redeemed' && g.status !== 'withdrawn').length
      track('snapshot', snapshotData(stakeSummary(st, address), goalsActive))
      markDaily('snapshot')
    }).catch(() => { /* chain unreadable: try on the next open */ })
  }, [ready, address]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready && address) runBadgeCheck() }, [ready, address, route, runBadgeCheck])
  useEffect(() => {
    let timer
    const onGoals = () => { clearTimeout(timer); timer = setTimeout(() => badgeCheckRef.current(), 300) }
    window.addEventListener('dibs:goals', onGoals)
    return () => { clearTimeout(timer); window.removeEventListener('dibs:goals', onGoals) }
  }, [])
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
  const isBlocked = useCallback(() => blocks.current > 0, [])
  const endStamp = useCallback(() => setStamps((q) => q.slice(1)), [])
  // Share on X (lib/poster.js). Spread the word only after a real share (shared or fallback, never cancelled or
  // failed); badges already earned stay. Then the badge check runs.
  const shareBadge = useCallback(async (badgeId) => {
    let result = 'failed'
    // The poster's chips: the current level and rank (lib/xp.js).
    let chips = []
    try {
      const { level } = levelOf(xpSummary({ goals: listGoals(address), badges: getBadges() }).xp)
      chips = [t('level_n', { n: level }), t(`rank_${rankOf(level).id}`)]
    } catch { /* poster without chips */ }
    try { result = await sharePoster(badgeId, { t, name: getName(), toast, chips }) } finally {
      if (shareEarns(result)) { setShared(); addSharedId(badgeId) }
      runBadgeCheck()
    }
    return result
  }, [t, toast, runBadgeCheck, address])

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

  toastRef.current = toast
  tRef.current = t
  const ctx = { t, lang, setLang, address, walletAddress, balance, refreshBalance, prices, demo: isDemo(), go, back, reset, toast, showHowTo, canGoBack, blockBack, shareBadge }

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
      {welcome && !isLab && route.name === 'home' && <WelcomeBack onDone={endWelcome} />}
      {intro === 'welcome' && !isLab && <WelcomeBack first onDone={endIntroWelcome} />}
      {intro === 'steps' && !isLab && <HowItWorks onDone={endIntro} />}
      {/* First-run intro: Home is not mounted behind it, so it loads (with its own entrance) after "Got it". */}
      {intro && !isLab ? <div className="app intro-bg" aria-hidden="true" /> : (
        <div className={`app${tabs ? ' with-tabs' : ''}`}><Screen {...route.params} />{tabs && <TabBar current={route.name} />}<BadgeStamp id={stamps[0] || null} isBlocked={isBlocked} onDone={endStamp} />{toastText && <div className="toast" role="status"><i>i</i>{toastText}</div>}</div>
      )}
    </AppCtx.Provider>
  )
}
