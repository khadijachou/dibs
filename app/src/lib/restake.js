// Put missing NIM back in staking (v1.2.10). When Savings shows a gap (the goals count more NIM than the staker holds,
// lib/stakeGap.js), one tap stakes the gap from the wallet onto the EXISTING staker. It records NO deposit and changes
// NO goal: the chain just catches up with what the goals already count.
//
// Like a deposit, the chain is the only judge: before the send we save the pending lock with the staked amount at that
// moment; after any answer from Nimiq Pay (hash, error, cancel, timeout, app closed) we compare the staker. It worked
// only if the staker grew by the amount. The same dibs:pending lock keeps a deposit and a restake from overlapping.
import { expired, landed, pending, startPending, stakedLuna } from './deposit.js'
import { stakeGapExact } from './stakeGap.js'
import { freeNimOf } from './readyState.js'
import { classify } from './errors.js'

const LOG_KEY = 'dibs.restakes' // a small local log of restakes that landed (last 20); diagnostics reads it, no hash shown
const LOG_MAX = 20

// One whole number everywhere, rounded UP from the exact gap (lib/stakeGap.js stakeGapExact), so what is shown and what
// is sent is always >= what the goals count. The tiny epsilon keeps a gap that is already whole (9,078.0) at 9,078.
export const wholeGap = (gapExact) => (gapExact == null ? null : Math.ceil(gapExact - 1e-9))

// The whole NIM to stake: the whole gap, capped by the free wallet NIM (NIM kept for ready goals is never used). null
// when there is nothing to do: the chain is unknown (gapExact null), the wallet is unknown or has no free NIM, or the
// amount is under 1 NIM. Whole NIM only; the cap is floored (never promise more wallet NIM than is spendable).
export function restakeAmount({ gapExact, free }) {
  if (gapExact == null || free == null) return null
  const n = Math.min(wholeGap(gapExact), Math.floor(free))
  return n < 1 ? null : n
}

// A pending record left by a restake (not a deposit). Deposits have no kind.
export const isRestake = (p) => p?.kind === 'restake'

// Where a restake record stands, read from the chain only (as deposits do).
//   'landed' the staker grew by the amount; 'failed' the wallet errored and its short deadline passed, or the record
//   is older than the 10 min give-up; 'wait' otherwise (still in flight, or an RPC hiccup upstream).
export function restakeOutcome(p, st, now) {
  if (landed(p, st)) return 'landed'
  if ((p.walletError && now > p.deadline) || expired(p)) return 'failed'
  return 'wait'
}

// Reads deferred so this module never touches localStorage at import time; the log holds { id, at, nim, tx }, last 20.
// Idempotent per lock id: a second settle of the same restake (e.g. two watchers racing) never doubles the entry.
function appendLog({ id, at, nim, tx }) {
  let arr = []
  try { const raw = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); if (Array.isArray(raw)) arr = raw } catch { /* corrupt */ }
  if (id && arr.some((e) => e.id === id)) return
  arr.push({ id, at, nim, tx: tx || '' })
  try { localStorage.setItem(LOG_KEY, JSON.stringify(arr.slice(-LOG_MAX))) } catch { /* storage blocked */ }
}

// Starts a restake. Dependencies are injected so tests can stub the chain and the wallet. Refuses (returns
// { ok: false, why }) when a pending record already exists, when the staker is null or unreadable (S1: never a new
// staker), when the fresh staker is still settling (settlingOf read from that same staker), or when the amount is null.
// Otherwise it locks (kind 'restake', goalId null), sends one add-stake, and patches the record with the tx or the
// wallet error, exactly as a deposit does.
export async function startRestake({ address, goals, readStaker, readWallet, stakeNim, settlingOf }) {
  if (pending.get(address)) return { ok: false, why: 'pending' }
  let st
  try { st = await readStaker(address) } catch { return { ok: false, why: 'staker' } }
  if (!st) return { ok: false, why: 'staker' }
  // Settling is judged from THIS fresh read (a deposit or an unlock still catching up), never a stale screen flag.
  const settling = settlingOf ? settlingOf(st) : false
  if (settling) return { ok: false, why: 'settling' }
  // S2: the amount is computed here, at the tap, from this fresh read, never from a figure rendered earlier.
  const gapExact = stakeGapExact({ st, goals, settling, pendingDeposit: false })
  const free = freeNimOf(await readWallet(), goals)
  const amount = restakeAmount({ gapExact, free })
  if (amount == null) return { ok: false, why: 'amount' }
  startPending({ address, goalId: null, nim: amount, beforeLuna: stakedLuna(st), newStaker: false })
  pending.patch(address, { kind: 'restake' })
  try {
    const tx = await stakeNim({ nim: amount, hasStaker: true })
    pending.patch(address, { tx: String(tx?.hash || tx || ''), deadline: Date.now() + 10 * 60_000 })
  } catch (e) {
    const key = classify(e, 'deposit')
    pending.patch(address, { walletError: key, deadline: Date.now() + (key === 'DEP_CANCELLED' ? 4000 : 45_000) })
  }
  return { ok: true, amount }
}

// Settles a restake record against the chain. Only acts on a restake record: a deposit record (no kind) is ignored and
// left in place. 'landed': logs it, clears the lock. 'failed': clears the lock. 'wait' (including an RPC failure): the
// lock stays. Never throws.
export async function settleRestake({ address, readStaker, now = Date.now() }) {
  const p = pending.get(address)
  if (!isRestake(p)) return { state: 'none' }
  let st
  try { st = await readStaker(address) } catch { return { state: 'wait' } }
  const outcome = restakeOutcome(p, st, now)
  if (outcome === 'landed') {
    appendLog({ id: p.id, at: now, nim: p.nim, tx: p.tx || '' })
    pending.clear()
    return { state: 'landed', nim: p.nim }
  }
  if (outcome === 'failed') {
    pending.clear()
    return { state: 'failed', error: p.walletError || 'unseen' }
  }
  return { state: 'wait' }
}
