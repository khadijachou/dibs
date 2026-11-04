// Fake wallet for desktop work. Mirrors the shape of the real provider closely
// enough for the screens; it does not imitate protocol waiting times.
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
const fakeHash = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')

export function createMockProvider() {
  let s = load()
  const tx = async (mutate) => {
    await wait(600)
    mutate()
    s.block += 60
    save(s)
    return fakeHash()
  }
  const fail = (type, message) => { const e = new Error(message); e.error = { type, message }; throw e }

  return {
    async listAccounts() { return [ADDRESS] },
    async getBalance() { return s.balance },
    async getBlockNumber() { s.block += 1; return s.block },
    async sign(message) { await wait(300); return { publicKey: 'demo', signature: 'demo:' + String(message).length } },
    mockStaker() {
      return s.staker ? { ...s.staker } : null
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
      return tx(() => { st.activeBalance = newActiveBalance; st.inactiveBalance = total - newActiveBalance })
    },
    sendRetireStakeTransaction({ retireStake }) {
      const st = s.staker
      if (!st || retireStake > st.inactiveBalance) fail('INVALID_TRANSACTION', 'Not enough inactive stake')
      return tx(() => { st.inactiveBalance -= retireStake; st.retiredBalance += retireStake })
    },
    sendRemoveStakeTransaction({ value }) {
      const st = s.staker
      if (!st || value > st.retiredBalance) fail('INVALID_TRANSACTION', 'Not enough retired stake')
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
    request() { return Promise.reject(new Error('No RPC in demo mode')) },
    setRPCUrl() {},
    resetDemo() { s = fresh(); save(s) },
  }
}
