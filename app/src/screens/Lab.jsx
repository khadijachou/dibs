// Lab: one button per check from the build plan. Open with #lab in the URL.
// Every call and its result goes into the log; Copy it and paste it in Discord.
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { config, toLuna, toNim } from '../lib/config.js'
import { listAccountsWithBalance, connect, describeError, getBalanceNim, getBlockNumber, getStaker, readStaker, host, isDemo, payInvoice, signMessage, unlock } from '../lib/nimiq.js'
import { parseInvoice } from '../lib/invoice.js'
import { getPrices } from '../lib/price.js'
import { api } from '../lib/api.js'
import { releaseBlockOf } from '../lib/release.js'

export default function Lab() {
  const { address, walletAddress } = useApp()
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

  // Release figures for section 3, read from the chain. The Lab's Retire and Remove stay ungated on purpose
  // (they test the chain's own refusals), so it says plainly when a send will be refused.
  const [rel, setRel] = useState(null)
  const readRel = useCallback(async () => {
    try {
      const [st, block] = await Promise.all([readStaker(address), getBlockNumber()])
      const from = Number(st?.inactiveFrom)
      setRel({
        block: Number(block),
        inactive: toNim(st?.inactiveBalance ?? 0),
        retired: toNim(st?.retiredBalance ?? 0),
        releaseBlock: from > 0 && Number(st?.inactiveBalance) > 0 ? releaseBlockOf(from) : null,
      })
    } catch (e) { setRel({ error: describeError(e).message }) }
  }, [address])
  useEffect(() => { readRel() }, [readRel])

  // Section 4 addresses, read when the section renders: the app address, the stable wallet address
  // if it differs, and every address listAccountsWithBalance() shares.
  const [signAddr, setSignAddr] = useState(null)
  const readSignAddr = useCallback(async () => {
    try {
      const accounts = await listAccountsWithBalance()
      setSignAddr({ address, walletAddress, accounts: accounts.map((a) => a.address) })
    } catch (e) { setSignAddr({ error: describeError(e).message }) }
  }, [address, walletAddress])
  useEffect(() => { readSignAddr() }, [readSignAddr])

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
      readRel()
    }
  }

  const amount = () => Number(nim)

  // Hex of the UTF-8 bytes of the Button C message, so the hex sent is exact and logged untouched.
  const SIGN_C_TEXT = 'Dibs Friends test 2026-11-21 C'
  const signCHex = [...new TextEncoder().encode(SIGN_C_TEXT)].map((b) => b.toString(16).padStart(2, '0')).join('')

  // typeof and length of a returned field, and whether the string looks like hex or base64.
  const describeField = (v) => {
    if (typeof v !== 'string') return { type: typeof v, value: v }
    const looksHex = /^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0
    const looksBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(v)
    return { type: 'string', length: v.length, looksLike: looksHex ? 'hex' : looksBase64 ? 'base64' : 'neither' }
  }

  // Runs one sign call and returns the message, the full result untouched, and the field shapes.
  const runSign = async (message) => {
    const { provider } = await connect()
    if (typeof provider.sign !== 'function') return 'sign is not available in demo mode'
    const result = await signMessage(message)
    return { message, result, publicKey: describeField(result?.publicKey), signature: describeField(result?.signature) }
  }

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
    signA: step('Sign text', () => runSign('Dibs Friends test 2026-11-21 A')),
    signB: step('Sign same text again', () => runSign('Dibs Friends test 2026-11-21 A')),
    signC: step('Sign hex', () => runSign({ message: signCHex, isHex: true })),
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
        {rel?.error && <p className="small">Release: could not read the chain ({rel.error})</p>}
        {rel && !rel.error && (
          <p className="small">
            Current block {rel.block.toLocaleString('en')} · release block {rel.releaseBlock != null ? rel.releaseBlock.toLocaleString('en') : 'none (nothing inactive)'}
            {' '}· inactive {rel.inactive} NIM · retired {rel.retired} NIM
          </p>
        )}
        {rel?.releaseBlock != null && rel.block < rel.releaseBlock && (
          <p className="small" style={{ color: '#B42318', fontWeight: 600 }}>
            Not released yet: this will be refused ({(rel.releaseBlock - rel.block).toLocaleString('en')} blocks to go)
          </p>
        )}
        <div className="btns" style={{ marginBottom: 8 }}>
          <button type="button" className="btn small ghost" disabled={busy} onClick={readRel}>Read release</button>
        </div>
        <div className="btns">
          <button type="button" className="btn small" disabled={busy} onClick={checks.deactivate}>1. Deactivate</button>
          <button type="button" className="btn small" disabled={busy} onClick={checks.retire}>2. Retire</button>
          <button type="button" className="btn small" disabled={busy} onClick={checks.remove}>3. Remove</button>
        </div>
      </section>

      <section className="card">
        <h2>4. Sign a message</h2>
        <p className="small">Signs a short text with the wallet, to prepare Friends. Nothing moves. Nimiq Pay asks to confirm each signature.</p>
        {signAddr?.error && <p className="small">Addresses: could not read ({signAddr.error})</p>}
        {signAddr && !signAddr.error && (
          <p className="small">
            App address {signAddr.address || '(none)'}
            {signAddr.walletAddress && signAddr.walletAddress !== signAddr.address ? ` · wallet ${signAddr.walletAddress}` : ''}
            {' '}· accounts {signAddr.accounts.length ? signAddr.accounts.join(', ') : '(none)'}
          </p>
        )}
        <div className="btns">
          <button type="button" className="btn small" disabled={busy} onClick={checks.signA}>Sign text</button>
          <button type="button" className="btn small" disabled={busy} onClick={checks.signB}>Sign same text again</button>
          <button type="button" className="btn small" disabled={busy} onClick={checks.signC}>Sign hex</button>
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
