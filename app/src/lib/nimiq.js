// One place for every call to Nimiq Pay. Screens never touch window.nimiq directly.
//
// Inside Nimiq Pay we use the real provider from @nimiq/mini-app-sdk.
// In a desktop browser (no provider) we fall back to a fake wallet ("demo mode")
// so screens can be built and tested without a phone.
import { init, NimiqProviderError, getHostLanguage, getHostNetwork, getHostFiat } from '@nimiq/mini-app-sdk'
import { simulated } from './errors.js'
import { config, toLuna, toNim } from './config.js'
import { createMockProvider } from './mockProvider.js'

let provider = null
let demo = false

export async function connect() {
  if (provider) return { provider, demo }
  try {
    provider = await init({ timeout: 3000 })
    demo = false
    if (config.rpcUrl && typeof provider.setRPCUrl === 'function') provider.setRPCUrl(config.rpcUrl)
  } catch {
    provider = createMockProvider()
    demo = true
  }
  return { provider, demo }
}

export const isDemo = () => demo

export const host = {
  language: () => getHostLanguage() || (navigator.language || 'en').slice(0, 2),
  network: () => (demo ? 'demo' : getHostNetwork() || 'mainnet'),
  fiat: () => getHostFiat() || 'USD',
}

// Turns any wallet error into { type, message, data } so screens can show it.
export function describeError(err) {
  if (NimiqProviderError.is(err)) return { type: err.type, message: err.message, data: err.data }
  if (err && err.error) return { type: err.error.type, message: err.error.message }
  return { type: 'UNKNOWN_ERROR', message: err?.message || String(err) }
}

// Nimiq Pay can share several accounts, and the first one is not always the funded one
// (seen on mainnet: NQ20... first with 0 NIM, the funded account second). Use the account
// with the highest balance; fall back to the first when no balance can be read.
export async function listAccountsWithBalance() {
  const accounts = await provider.listAccounts()
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('No Nimiq account shared')
  const out = []
  for (const address of accounts) {
    let nim = null
    try { nim = await getBalanceNim(address) } catch { /* older host */ }
    out.push({ address, nim })
  }
  return out
}

export async function getAccount() {
  const list = await listAccountsWithBalance()
  const funded = list.filter((a) => a.nim > 0).sort((a, b) => b.nim - a.nim)
  return (funded[0] || list[0]).address
}

// Waits for consensus first: before that, the host can answer 0 for a funded address.
export async function getBalanceNim(address) {
  if (!demo && typeof provider.isConsensusEstablished === 'function') {
    for (let i = 0; i < 20; i++) {
      try { if (await provider.isConsensusEstablished()) break } catch { break }
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  const luna = await provider.getBalance(address)
  return toNim(typeof luna === 'object' && luna !== null ? luna.balance ?? 0 : luna)
}

export async function getBlockNumber() {
  return provider.getBlockNumber()
}

// Staker read through the configured JSON-RPC endpoint.
// Method name to confirm in the Lab (check 2). Returns null when no RPC is set
// or the address has no staker.
export async function getStaker(address) {
  if (demo) return provider.mockStaker(address)
  if (!config.rpcUrl) return null
  try {
    const res = await provider.request({ method: 'getStakerByAddress', params: [address] })
    return res?.data ?? res ?? null
  } catch {
    return null
  }
}

// Adds NIM to the user's own staker. First deposit creates the staker
// (100 NIM minimum), later deposits add to it.
export async function stakeNim({ nim, hasStaker, validator = config.defaultValidator || (demo ? 'NQ00 DEMO VALIDATOR' : '') }) {
  if (demo) simulated('deposit')
  const value = toLuna(nim)
  if (!hasStaker) {
    if (!validator) throw new Error('No validator configured (VITE_DEFAULT_VALIDATOR)')
    return provider.sendNewStakerTransaction({ delegation: validator, value })
  }
  return provider.sendStakeTransaction({ value })
}

// Unlock is three protocol steps. Waiting times between them are check 3.
const sim = (fn) => (...a) => { if (demo) simulated('unlock'); return fn(...a) }
export const unlock = {
  deactivate: (newActiveNim) => provider.sendSetActiveStakeTransaction({ newActiveBalance: toLuna(newActiveNim) }),
  retire: sim((nim) => provider.sendRetireStakeTransaction({ retireStake: toLuna(nim) })),
  remove: (nim) => provider.sendRemoveStakeTransaction({ value: toLuna(nim) }),
}

// Pays a fixed-amount BOLT11 invoice. The user picks NIM or USDT in Nimiq Pay.
// Never retry after TRANSACTION_OUTCOME_UNKNOWN (see SDK README).
export async function payInvoice(invoice) {
  if (demo) simulated('pay')
  return provider.payLightningInvoice({ invoice: invoice.trim() })
}

export async function signMessage(message) {
  return provider.sign(message)
}
