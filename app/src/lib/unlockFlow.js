// The unlock flow's chain reads and sends, around the pure rules in lib/unlock.js.
// Every screen (Goal, Unlock, Redeem) asks getUnlockState and goes to the matching step: steps done in the Lab,
// an app closed half way and refused txs all resume from the chain. Stored hashes are for display only.
import { getBlockNumber, isDemo, readStaker, unlock, walletNim } from './nimiq.js'
import { listGoals, savedNim, updateGoal } from './goals.js'
import { toNim } from './config.js'
import { DONE, sendGated, unlockStateOf } from './unlock.js'

const started = (goal) => goal.status === 'unlocking' || goal.status === 'ready'
const hasRemove = (goal) => (goal.unlockSteps || []).some((x) => x.step === 'remove')
// This goal already finished an unlock: its NIM came back once, so Stop staking is never offered for it again.
export const finished = (goal) => goal.status === 'ready' || hasRemove(goal)

// The reads getUnlockState makes. Tests pass their own; the app always uses these.
const IO = { walletNim, getBlockNumber, readStaker, isDemo }

// Fresh read of the chain for this goal. Throws when the chain cannot be read: pause, never guess.
// An unreadable wallet (null) also throws when the wallet decides the state: a started goal with nothing inactive or
// retired (13 Nov: an unreadable wallet counted as 0 NIM turned a finished goal back into "stake"). With NIM inactive
// or retired the state is waiting, ready or remove whatever the wallet holds, and a goal not started never reads
// 'pay': both keep reading the wallet as 0.
export async function getUnlockState(goal, address, io = IO) {
  const wallet = await io.walletNim() // read first: it also refreshes the shared addresses readStaker merges
  const [block, staker] = await Promise.all([io.getBlockNumber(), io.readStaker(address)])
  const leaving = Number(staker?.inactiveBalance ?? 0) + Number(staker?.retiredBalance ?? 0)
  if (wallet == null && started(goal) && !(leaving > 0)) throw new Error('Wallet balance unreadable: cannot tell whether the NIM is back')
  const othersNim = listGoals(address).filter((g) => g.id !== goal.id && g.status === 'saving').reduce((s, g) => s + savedNim(g), 0)
  return unlockStateOf({ staker, block: Number(block), walletNim: wallet ?? 0, goalNim: savedNim(goal), othersNim, started: started(goal), finished: finished(goal), demo: io.isDemo() })
}

const SEND = {
  deactivate: (luna) => unlock.deactivate(toNim(luna)),
  retire: (luna) => unlock.retire(toNim(luna)),
  remove: (luna) => unlock.remove(toNim(luna)),
}

// The only way the app sends an unlock step: state re-read right before, Nimiq Pay opened only when the chain
// allows it, amounts from that read. A refused gate throws with .gate = { step, us } and nothing is sent.
export function sendUnlockStep(goal, address, step) {
  return sendGated(step, { readState: () => getUnlockState(goal, address), send: (s, luna) => SEND[s](luna) })
}

// Brings the goal's saved status in line with the chain. Returns { goal, outcome } where outcome is
// 'ready' (card mode, NIM back: pay the shop), 'withdrawn' (withdraw mode, NIM back) or null.
export function settleGoal(address, goal, us) {
  if (!goal || !us) return { goal, outcome: null }
  const s = us.state
  const done = DONE[s]
  // On 'stake', a ready goal or one with a Remove keeps its step records: they prove the unlock was done.
  const keep = s === 'stake' && finished(goal)
  const steps = keep ? (goal.unlockSteps || []) : (goal.unlockSteps || []).filter((x) => done.includes(x.step))
  const patch = {}
  if (steps.length !== (goal.unlockSteps || []).length) patch.unlockSteps = steps
  if (goal.unlockPending) patch.unlockPending = null // old pointer from before 10 Nov: never locks the flow
  let outcome = null
  if (s === 'pay' && goal.status === 'unlocking') {
    if (goal.unlockMode === 'withdraw') {
      const at = new Date().toISOString()
      const nim = savedNim(goal)
      Object.assign(patch, { status: 'withdrawn', withdrawnAt: at, deposits: [...goal.deposits, { id: crypto.randomUUID?.() || at, nim: -nim, kind: 'withdraw', at }] })
      outcome = 'withdrawn'
    } else {
      patch.status = 'ready'
      outcome = 'ready'
    }
  } else if (goal.status === 'ready' && (s === 'waiting' || s === 'ready' || s === 'remove')) {
    patch.status = 'unlocking' // the chain still holds NIM in the unlock: the card waits for it
  } else if (goal.status === 'saving' && s !== 'stake' && s !== 'pay' && savedNim(goal) >= goal.targetNim
    && !listGoals(address).some((g) => g.id !== goal.id && g.status === 'unlocking')) {
    patch.status = 'unlocking' // step 1 sent from the Lab (or by an older build) for this goal
  }
  if (!Object.keys(patch).length) return { goal, outcome }
  return { goal: updateGoal(address, goal.id, patch) || goal, outcome }
}
