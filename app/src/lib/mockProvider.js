// Fake wallet for desktop work. Mirrors the shape of the real provider closely
// enough for the screens; it does not imitate protocol waiting times.
import { EPOCH, releaseBlockOf } from './release.js'

const KEY = 'dibs.demoWallet'
const ADDRESS = 'NQ00 DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO'
const LUNA = 100_000

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && s.v !== 2) return fresh()
    if (s) return s
  } catch { /* storage blocked */ }
  return fresh()
}
// Demo wallet starts with 500,000 NIM so goals at real NIM prices can be reached.
function fresh() {
  return { v: 2, balance: 500_000 * LUNA, staker: null, block: 4_200_000 }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// A seeded wallet can carry `clock` (ms): its height then moves one block per second from `block` at that time,
// so a seeded staker crosses its release while the page is open. Without it, the height only moves on calls.
const height = (s) => s.block + (s.clock ? Math.max(0, Math.floor((Date.now() - s.clock) / 1000)) : 0)
// ?sim=UNL_WAITING (lib/errors.js): unlocks get a release 12 h away instead of releasing at once.
const simWaiting = () => { try { return localStorage.getItem('dibs.simulate') === 'UNL_WAITING' } catch { return false } }
const fakeHash = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')

export function createMockProvider() {
  let s = load()
  // ok = false: included but refused by the chain (executionResult false), as for an early Retire on mainnet.
  const tx = async (mutate, ok = true) => {
    await wait(600)
    mutate()
    s.block += 60
    const hash = fakeHash()
    s.txs = { ...(s.txs || {}), [hash]: { ok, block: height(s) } }
    const keys = Object.keys(s.txs)
    if (keys.length > 20) delete s.txs[keys[0]]
    save(s)
    return hash
  }
  // Release 12 h from now, with the height moving one block per second so it can be crossed while open.
  const startWaiting = (st) => {
    s.block = height(s)
    s.clock = Date.now()
    st.inactiveFrom = s.block + 12 * 3600 - EPOCH - 1
  }
  const fail = (type, message) => { const e = new Error(message); e.error = { type, message }; throw e }

  return {
    async listAccounts() { return [ADDRESS] },
    async getBalance() { return s.balance },
    async getBlockNumber() { s.block += 1; return height(s) },
    async sign(message) { await wait(300); return { publicKey: 'demo', signature: 'demo:' + String(message).length } },
    mockStaker() {
      if (simWaiting() && s.staker?.inactiveBalance > 0 && !s.staker.inactiveFrom) { startWaiting(s.staker); save(s) }
      return s.staker ? { ...s.staker, address: s.staker.address || ADDRESS } : null
    },
    sendNewStakerTransaction({ delegation, value }) {
      if (s.staker) fail('INVALID_TRANSACTION', 'Staker already exists')
      if (value < 100 * LUNA) fail('INVALID_TRANSACTION', 'Minimum stake is 100 NIM')
      if (value > s.balance) fail('INSUFFICIENT_FUNDS', 'Not enough NIM')
      return tx(() => { s.balance -= value; s.staker = { delegation, activeBalance: value, inactiveBalance: 0, retiredBalance: 0 } })
    },
    sendStakeTransaction({ value }) {
      if (!s.staker) fail('INVALID_TRANSACTION', 'No staker for this address')
      if (value > s.balance) fail('INSUFFICIENT_FUNDS', 'Not enough NIM')
      return tx(() => { s.balance -= value; s.staker.activeBalance += value })
    },
    sendSetActiveStakeTransaction({ newActiveBalance }) {
      const st = s.staker
      if (!st) fail('INVALID_TRANSACTION', 'No staker')
      const total = st.activeBalance + st.inactiveBalance
      if (newActiveBalance > total) fail('INVALID_TRANSACTION', 'Not enough stake')
      return tx(() => {
        st.activeBalance = newActiveBalance
        st.inactiveBalance = total - newActiveBalance
        if (simWaiting() && st.inactiveBalance > 0) startWaiting(st)
      })
    },
    sendRetireStakeTransaction({ retireStake }) {
      const st = s.staker
      if (!st || retireStake > st.inactiveBalance) fail('INVALID_TRANSACTION', 'Not enough inactive stake')
      // Like mainnet: before the release Nimiq Pay still returns a hash, but the chain refuses it (nothing moves).
      // Only a seeded staker carries inactiveFrom; the demo's own unlock has none and releases at once.
      if (st.inactiveFrom && height(s) < releaseBlockOf(st.inactiveFrom)) return tx(() => {}, false)
      return tx(() => {
        st.inactiveBalance -= retireStake
        st.retiredBalance += retireStake
        if (!st.inactiveBalance) delete st.inactiveFrom
      })
    },
    sendRemoveStakeTransaction({ value }) {
      const st = s.staker
      if (!st || value > st.retiredBalance) fail('INVALID_TRANSACTION', 'Not enough retired stake')
      if (value !== st.retiredBalance) return tx(() => {}, false) // mainnet: Remove must take the whole retired balance
      return tx(() => { st.retiredBalance -= value; s.balance += value })
    },
    async payLightningInvoice({ invoice }) {
      if (!/^ln/i.test(invoice)) fail('INVALID_INVOICE', 'Not a Lightning invoice')
      await wait(900)
      // Demo only: charges the NIM amount the app attached to the invoice string, if any.
      const m = /#nim=(\d+)/.exec(invoice)
      if (m) {
        const luna = Number(m[1]) * LUNA
        if (luna > s.balance) fail('INSUFFICIENT_FUNDS', 'Not enough NIM')
        s.balance -= luna
        save(s)
      }
      return { hash: fakeHash(), swapId: 'demo-' + fakeHash().slice(0, 8) }
    },
    // Only the tx outcome is answered; the staker comes from mockStaker().
    async request({ method, params } = {}) {
      if (method === 'getTransactionByHash') {
        const rec = s.txs?.[params?.[0]]
        if (!rec) throw new Error('Transaction not found')
        return { data: { hash: params[0], blockNumber: rec.block, executionResult: rec.ok } }
      }
      throw new Error('No RPC in demo mode')
    },
    setRPCUrl() {},
    resetDemo() { s = fresh(); save(s) },
  }
}
