// Lab: one button per check from the build plan. Open with #lab in the URL.
// Every call and its result goes into the log; Copy it and paste it in Discord.
import { useState } from 'react'
import { useApp } from '../App.jsx'
import { config, toLuna, toNim } from '../lib/config.js'
import { listAccountsWithBalance, connect, describeError, getBalanceNim, getBlockNumber, getStaker, readStaker, host, isDemo, payInvoice, unlock } from '../lib/nimiq.js'
import { parseInvoice } from '../lib/invoice.js'
import { getPrices } from '../lib/price.js'
import { api } from '../lib/api.js'

export default function Lab() {
  const { address } = useApp()
  const [log, setLog] = useState([])
  const [invoice, setInvoice] = useState('')
  const [validator, setValidator] = useState(config.defaultValidator)
  const [nim, setNim] = useState('100')
  const [busy, setBusy] = useState(false)
  const [rpcUrl, setRpcUrl] = useState(config.rpcUrl)
  const [rpcMethod, setRpcMethod] = useState('getStakerByAddress')
  const [rpcParams, setRpcParams] = useState('["$ADDRESS"]')
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('dibs.email') || '' } catch { return '' } })
  const [orderId, setOrderId] = useState(null)
  const [orderToken, setOrderToken] = useState(null)
  const [paidAt, setPaidAt] = useState(null)

  const write = (label, data) =>
    setLog((l) => [...l, `[${new Date().toISOString().slice(11, 19)}] ${label}: ${typeof data === 'string' ? data : JSON.stringify(data)}`])

  const step = (label, fn) => async () => {
    setBusy(true)
    const t0 = performance.now()
    try {
      const res = await fn()
      write(`${label} OK (${Math.round(performance.now() - t0)} ms)`, res ?? 'done')
    } catch (e) {
      write(`${label} ERROR`, describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const amount = () => Number(nim)

  const checks = {
    env: step('Environment', async () => ({
      demo: isDemo(),
      network: host.network(),
      language: host.language(),
      fiat: host.fiat(),
      address,
      rpcUrl: config.rpcUrl || '(none)',
      validator: validator || '(none)',
      block: await getBlockNumber(),
      consensus: await connect().then(({ provider }) => provider.isConsensusEstablished?.()).catch(() => 'n/a'),
      rawBalance: await connect().then(({ provider }) => provider.getBalance(address)).catch((e) => 'error: ' + e.message),
      rawBalanceNoSpaces: await connect().then(({ provider }) => provider.getBalance(address.replace(/\s/g, ''))).catch((e) => 'error: ' + e.message),
      rawBalanceLegacy: await (window.nimiq?.getBalance ? window.nimiq.getBalance(address) : Promise.resolve('n/a')).catch((e) => 'error: ' + e.message),
      accounts: await listAccountsWithBalance().catch((e) => 'error: ' + e.message),
      balanceNim: await getBalanceNim(address),
    })),
    prices: step('Prices', () => getPrices()),
    parse: step('Parse invoice', async () => parseInvoice(invoice) || 'not a BOLT11 invoice with an amount'),
    order: step('Bitrefill invoice (Steam 5 USD)', async () => {
      try { localStorage.setItem('dibs.email', email) } catch { /* ignore */ }
      const o = await api.createOrder('steam-5', email.trim())
      setInvoice(o.invoice)
      setOrderId(o.orderId)
      setOrderToken(o.orderToken || null)
      return { orderId: o.orderId, sats: o.sats, usd: o.usd, expiresAt: o.expiresAt }
    }),
    pay: step('payLightningInvoice', async () => {
      const res = await payInvoice(invoice)
      setPaidAt(Date.now())
      return res
    }),
    status: step('Bitrefill order status', async () => {
      const o = await api.order(orderId, orderToken)
      return { ...o, secondsSincePay: paidAt ? Math.round((Date.now() - paidAt) / 1000) : null }
    }),
    staker: step('Read staker (RPC getStakerByAddress)', () => readStaker(address)),
    rpc: step('Raw RPC', async () => {
      const { provider } = await connect()
      if (rpcUrl.trim()) provider.setRPCUrl(rpcUrl.trim())
      const params = rpcParams.trim() ? JSON.parse(rpcParams.replace('$ADDRESS', address)) : []
      return provider.request({ method: rpcMethod.trim(), params })
    }),
    newStaker: step('sendNewStakerTransaction', async () => {
      const { provider } = await connect()
      return provider.sendNewStakerTransaction({ delegation: validator.trim(), value: toLuna(amount()) })
    }),
    addStake: step('sendStakeTransaction', async () => {
      const { provider } = await connect()
      return provider.sendStakeTransaction({ value: toLuna(amount()) })
    }),
    deactivate: step('sendSetActiveStakeTransaction (active minus amount)', async () => {
      const st = await getStaker(address)
      const active = st?.balance ?? st?.activeBalance
      if (active == null) throw new Error('Need a staker read first (RPC) to know the active balance')
      return unlock.deactivate(Math.max(0, toNim(active) - amount()))
    }),
    retire: step('sendRetireStakeTransaction', () => unlock.retire(amount())),
    remove: step('sendRemoveStakeTransaction', () => unlock.remove(amount())),
  }

  const copy = () => navigator.clipboard?.writeText(log.join('\n'))

  // Demo only: wipes the fake wallet and every goal stored by Dibs in this browser.
  const resetDemo = () => {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('dibs.')).forEach((k) => localStorage.removeItem(k))
    } catch { /* storage blocked */ }
    location.hash = ''
    location.reload()
  }

  return (
    <main className="screen lab">
      <h2 className="title">Lab</h2>
      <p className="small">Checks 1 to 3 from the build plan. Use small amounts. Network: {host.network()}</p>

      <section className="card">
        <h2>0. Environment</h2>
        <div className="btns">
          <button type="button" className="btn small" disabled={busy} onClick={checks.env}>Read environment</button>
          <button type="button" className="btn small ghost" disabled={busy} onClick={checks.prices}>Prices</button>
          {isDemo() && (
            <button type="button" className="btn small ghost" onClick={resetDemo}>Reset demo data</button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>1. Lightning payment</h2>
        <p className="small">Paste a fixed-amount invoice for the same network (mainnet invoice on mainnet). Start around 1 USD. Note how long the swap takes and which asset Nimiq Pay offers.</p>
        <label className="small" htmlFor="labmail">Email for the Bitrefill receipt</label>
        <input id="labmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <div className="btns">
          <button type="button" className="btn small ghost" disabled={busy || !email} onClick={checks.order}>Get Bitrefill invoice</button>
        </div>
        <textarea className="invoice" value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="lnbc…" />
        <div className="btns">
          <button type="button" className="btn small ghost" disabled={busy} onClick={checks.parse}>Parse</button>
          <button type="button" className="btn small" disabled={busy || !invoice} onClick={checks.pay}>Pay invoice</button>
          <button type="button" className="btn small ghost" disabled={busy || !orderId} onClick={checks.status}>Order status</button>
        </div>
      </section>

      <section className="card">
        <h2>2. Staking</h2>
        <label className="small" htmlFor="val">Validator address</label>
        <input id="val" value={validator} onChange={(e) => setValidator(e.target.value)} placeholder="NQ.." />
        <label className="small" htmlFor="nim">Amount (NIM)</label>
        <input id="nim" inputMode="numeric" value={nim} onChange={(e) => setNim(e.target.value)} />
        <div className="btns">
          <button type="button" className="btn small ghost" disabled={busy} onClick={checks.staker}>Read staker</button>
          <button type="button" className="btn small" disabled={busy || !validator} onClick={checks.newStaker}>New staker</button>
          <button type="button" className="btn small" disabled={busy} onClick={checks.addStake}>Add stake</button>
        </div>
      </section>

      <section className="card">
        <h2>2b. Raw RPC</h2>
        <p className="small">Find the method names and the staker fields. $ADDRESS is replaced by your address.</p>
        <input aria-label="RPC URL" value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} placeholder="https://… (Nimiq JSON-RPC)" />
        <input aria-label="Method" value={rpcMethod} onChange={(e) => setRpcMethod(e.target.value)} />
        <input aria-label="Params (JSON)" value={rpcParams} onChange={(e) => setRpcParams(e.target.value)} />
        <div className="btns">
          <button type="button" className="btn small ghost" disabled={busy || !rpcMethod} onClick={checks.rpc}>Call</button>
        </div>
      </section>

      <section className="card">
        <h2>3. Unlock sequence</h2>
        <p className="small">Run in order with the amount above. If a step is refused, note the error and the block height, then retry later to measure the wait.</p>
        <div className="btns">
          <button type="button" className="btn small" disabled={busy} onClick={checks.deactivate}>1. Deactivate</button>
          <button type="button" className="btn small" disabled={busy} onClick={checks.retire}>2. Retire</button>
          <button type="button" className="btn small" disabled={busy} onClick={checks.remove}>3. Remove</button>
        </div>
      </section>

      <section className="card">
        <div className="row"><h2>Log</h2><span /></div>
        <div className="log" aria-live="polite">{log.length ? log.join('\n') : 'No results yet.'}</div>
        <div className="btns">
          <button type="button" className="btn small" onClick={copy} disabled={!log.length}>Copy log</button>
          <button type="button" className="btn small ghost" onClick={() => setLog([])}>Clear</button>
          <a className="btn small ghost" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }} href="#">Back to app</a>
        </div>
      </section>
    </main>
  )
}
