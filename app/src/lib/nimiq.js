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
  sharedAddresses = accounts.slice()
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

// Staker read through the configured JSON-RPC endpoint (VITE_NIMIQ_RPC_URL; the SDK
// sends these calls straight to that URL, not through Nimiq Pay).
//
// Seen on mainnet (7 Nov): Nimiq Pay pays staking transactions from the funded address
// (NQ80...) but the staker belongs to the other shared address (NQ20...). So we read
// every shared address and merge what we find.
//
// readStaker: merged staker (balances summed, `address` = where it was found), or null
// when every address answers "No staker with address". Any other failure throws, so a
// caller never mistakes "can't read" for "no staker" before sending a transaction.
let sharedAddresses = []
const NO_STAKER = /no staker|not found/i

async function readStakerAt(address) {
  try {
    const res = await provider.request({ method: 'getStakerByAddress', params: [address] })
    const st = res?.data ?? res
    return st && typeof st === 'object' ? st : null
  } catch (e) {
    if (NO_STAKER.test(String(e?.message || ''))) return null
    throw e
  }
}

export async function readStaker(address) {
  if (demo) return provider.mockStaker(address)
  if (!config.rpcUrl) throw new Error('No RPC URL configured (VITE_NIMIQ_RPC_URL)')
  const addresses = [address, ...sharedAddresses.filter((a) => a !== address)]
  const found = []
  for (const a of addresses) {
    const st = await readStakerAt(a)
    if (st) found.push({ ...st, address: st.address || a })
  }
  if (!found.length) return null
  const sum = (k) => found.reduce((n, st) => n + Number(st[k] ?? 0), 0)
  return {
    ...found[0],
    balance: found.reduce((n, st) => n + Number(st.balance ?? st.activeBalance ?? 0), 0),
    inactiveBalance: sum('inactiveBalance'),
    retiredBalance: sum('retiredBalance'),
    stakers: found.map((st) => st.address),
  }
}

// Same read for display only: never throws, null when unknown.
export async function getStaker(address) {
  try { return await readStaker(address) } catch { return null }
}

// Adds NIM to the user's own staker. First deposit creates the staker
// (100 NIM minimum), later deposits add to it.
export async function stakeNim({ nim, hasStaker, validator = config.defaultValidator || (demo ? 'NQ00 DEMO VALIDATOR' : '') }) {
  if (demo) simulated('deposit')
  const value = toLuna(nim)
  if (!hasStaker && !validator) throw new Error('No validator configured (VITE_DEFAULT_VALIDATOR)')
  const tx = await (hasStaker
    ? provider.sendStakeTransaction({ value })
    : provider.sendNewStakerTransaction({ delegation: validator, value }))
  if (demo) simulated('deposit-sent')
  return tx
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
