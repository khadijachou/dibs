import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { connect, getBalanceNim, host, isDemo, listAccountsWithBalance } from './lib/nimiq.js'
import { getPrices } from './lib/price.js'
import { makeT } from './lib/i18n.js'
import { adoptGoals, listGoals } from './lib/goals.js'
import { loadCatalog } from './lib/catalog.js'
import Home from './screens/Home.jsx'
import Catalog from './screens/Catalog.jsx'
import Plan from './screens/Plan.jsx'
import Goal from './screens/Goal.jsx'
import Unlock from './screens/Unlock.jsx'
import Redeem from './screens/Redeem.jsx'
import Done from './screens/Done.jsx'
import Lab from './screens/Lab.jsx'

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
  const [isLab, setIsLab] = useState(() => location.hash === '#lab')
  const lang = useMemo(() => host.language(), [ready])
  const t = useMemo(() => makeT(lang), [lang])

  const refreshBalance = useCallback(async (addr = address) => {
    if (!addr) return
    try { setBalance(await getBalanceNim(addr)) } catch { /* older hosts: no getBalance */ }
  }, [address])

  const start = useCallback(async () => {
    setFatal(null)
    try {
      await connect()
      const accounts = await listAccountsWithBalance()
      const funded = accounts.filter((a) => a.nim > 0).sort((a, b) => b.nim - a.nim)
      const addr = (funded[0] || accounts[0]).address
      adoptGoals(addr, accounts.map((a) => a.address))
      setAddress(addr)
      refreshBalance(addr)
      await loadCatalog()
      getPrices().then(setPrices)
      // Returning users land on their goals, new users on the catalogue.
      setRoute({ name: listGoals(addr).length ? 'home' : 'catalog', params: {} })
      setReady(true)
    } catch (e) {
      setFatal(e)
    }
  }, [refreshBalance])

  useEffect(() => { start() }, [start])
  useEffect(() => {
    const onHash = () => setIsLab(location.hash === '#lab')
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

  const ctx = { t, lang, address, balance, refreshBalance, prices, demo: isDemo(), go, back, reset, canGoBack: history.length > 0 }

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
    return <div className="app"><div className="screen center" style={{ justifyContent: 'center' }}><p className="sub">{t('loading')}</p></div></div>
  }

  const Screen = isLab ? Lab : SCREENS[route.name] || Home
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app"><Screen {...route.params} /></div>
    </AppCtx.Provider>
  )
}
