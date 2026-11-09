// Which unlock step comes next, read from the staker, never from saved flags. Pure, so `npm test` runs it.
// Balances in luna, as readStaker returns them. A goal's NIM moves active -> inactive (step 1, "deactivate"),
// inactive -> retired (step 2, "retire", only after the release), retired -> wallet (step 3, "remove").
import { toLuna } from './config.js'

export const STEPS = ['deactivate', 'retire', 'remove']
const n = (v) => Number(v ?? 0)

// { current, done }: current = the next step to send; done = steps the chain shows as completed.
// retiredBalance covering the goal: step 3 is next. inactiveBalance covering it (retired not): step 2 is next.
// Otherwise step 1. Step 3 is never next while retiredBalance is short of the goal (0 included).
export function stageOf(st, amountNim) {
  const need = toLuna(amountNim)
  if (!(need > 0)) return { current: null, done: [], empty: true }
  if (!st) return { current: null, done: [], noStaker: true }
  if (n(st.retiredBalance) >= need) return { current: 'remove', done: ['deactivate', 'retire'] }
  if (n(st.inactiveBalance) >= need) return { current: 'retire', done: ['deactivate'] }
  return { current: 'deactivate', done: [] }
}

// Did the read after a sent step confirm it? pending: { step, retiredBefore (luna) }.
// Steps 1 and 2 are confirmed when the stage moves past them; step 3 when the retired balance dropped by
// the goal's amount (or the staker is gone: everything was removed).
export function confirms(pending, st, amountNim) {
  if (!pending) return false
  if (pending.step === 'remove') return !st || n(st.retiredBalance) <= n(pending.retiredBefore) - toLuna(amountNim)
  const { current } = stageOf(st, amountNim)
  return current != null && STEPS.indexOf(current) > STEPS.indexOf(pending.step)
}
