// Deposits (BUG-01). One tap = one transaction, and the chain is the only judge.
//
// Before Nimiq Pay opens, we read the staker and save a "pending" record with the amount
// staked at that moment. Whatever Nimiq Pay answers (hash, error, cancel, timeout, app closed),
// we then compare the staker with that amount: if it grew by the deposit, the deposit happened.
// While a pending record exists, no new deposit can start, on any goal, even after a reload.
import { readStaker } from './nimiq.js'
import { addDeposit, getGoal } from './goals.js'
import { LUNA_PER_NIM, toLuna } from './config.js'

const KEY = 'dibs:pending'
const GIVE_UP_MS = 10 * 60_000 // no growth 10 min after the attempt: stop waiting

// Everything the staker(s) hold, summed over the shared addresses (see readStaker).
// A deposit raises it; unlock steps move NIM inside it until Remove.
export const stakedLuna = (st) =>
  st ? Number(st.balance ?? st.activeBalance ?? 0) + Number(st.inactiveBalance ?? 0) + Number(st.retiredBalance ?? 0) : 0

export const pending = {
  get(address) {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || 'null')
      // v1 records (7 Nov, first deploy) measured only one address: their "before" is wrong.
      if (p && p.v !== 2) { localStorage.removeItem(KEY); return null }
      // One pending deposit per device, whatever address Nimiq Pay lists today
      // (the funded address can change after NIM is received, seen 7 Nov).
      return p || null
    } catch { return null }
  },
  set(p) { try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* storage blocked */ } },
  patch(address, fields) { const p = pending.get(address); if (p) pending.set({ ...p, ...fields }) },
  clear() { try { localStorage.removeItem(KEY) } catch { /* ignore */ } },
}

export function startPending({ address, goalId, nim, beforeLuna, newStaker }) {
  const p = { v: 2, id: `dep-${Date.now()}`, address, goalId, nim, beforeLuna, newStaker, at: Date.now(), tx: null, walletError: null }
  pending.set(p)
  return p
}

// Did the staker grow by the deposit? 1 NIM of slack for rounding.
export const landed = (p, st) => stakedLuna(st) - p.beforeLuna >= toLuna(p.nim) - LUNA_PER_NIM

// Records the deposit once (guarded by the pending id), clears the lock, returns the updated goal.
export function confirmPending(p, address = p.address) {
  const goal = getGoal(address, p.goalId)
  pending.clear()
  if (!goal) return null
  if (goal.deposits.some((d) => d.id === p.id)) return goal
  return addDeposit(address, p.goalId, { id: p.id, nim: p.nim, tx: p.tx || '' })
}

// Polls the chain until the deposit shows, or until `untilMs` passes.
// Returns 'landed' | 'not-yet'. RPC failures count as "not yet".
export async function waitForDeposit(p, { untilMs, address = p.address, everyMs = 2000, isCancelled = () => false }) {
  while (!isCancelled()) {
    try { if (landed(p, await readStaker(address))) return 'landed' } catch { /* RPC hiccup: keep trying */ }
    if (Date.now() >= untilMs) return 'not-yet'
    await new Promise((r) => setTimeout(r, everyMs))
  }
  return 'not-yet'
}

export const expired = (p) => Date.now() - p.at > GIVE_UP_MS
