import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { connect, getBalanceNim, host, isDemo, listAccountsWithBalance } from './lib/nimiq.js'
import { getPrices } from './lib/price.js'
import { makeT } from './lib/i18n.js'
import { adoptGoals } from './lib/goals.js'
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

// The Lab (#lab) is a developer screen: only in demo mode or in a build made with VITE_LAB=1.
const labAllowed = () => import.meta.env.VITE_LAB === '1' || isDemo()

const LANGS = ['en', 'fr', 'es']
const readLang = () => { try { const l = localStorage.getItem('dibs.lang'); return LANGS.includes(l) ? l : null } catch { return null } }
const hostLang = () => { try { const l = String(host.language() || '').slice(0, 2).toLowerCase(); return LANGS.includes(l) ? l : 'en' } catch { return 'en' } }

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

const SCREENS = { home: Home, catalog: Catalog, plan: Plan, goal: Goal, unlock: Unlock, redeem: Redeem, done: Done }

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
  useEffect(() => { const id = setTimeout(() => setSplashMin(true), 900); return () => clearTimeout(id) }, [])
  const finishOnboarding = useCallback(() => {
    try { localStorage.setItem('dibs.onboarded', '1') } catch { /* private mode */ }
    setOnboarded(true)
    window.scrollTo(0, 0)
  }, [])

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
      setRoute({ name: 'home', params: {} })
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
  const back = useCallback(() => {
    setHistory((h) => {
      const prev = h.at(-1)
      if (prev) setRoute(prev)
      return h.slice(0, -1)
    })
  }, [])
  const reset = useCallback((name = 'home', params = {}) => { setHistory([]); setRoute({ name, params }) }, [])

  const ctx = { t, lang, setLang, address, balance, refreshBalance, prices, demo: isDemo(), go, back, reset, toast, canGoBack: history.length > 0 }

  if (!splashMin) return <AppCtx.Provider value={ctx}><Splash /></AppCtx.Provider>
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

  const Screen = isLab ? Lab : SCREENS[route.name] || Home
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app"><Screen {...route.params} />{toastText && <div className="toast" role="status"><i>i</i>{toastText}</div>}</div>
    </AppCtx.Provider>
  )
}
