// Where a goal's unlock stands, from the chain only (staker, block height, wallet balance). Pure: no browser
// imports, so `npm test` runs it. lib/unlockFlow.js does the reads and the sends around it.
//
// Mainnet, 9 Nov: a Retire sent one minute after Stop staking was refused by the chain (release block not
// reached), and Nimiq Pay then kept it "pending" and refused the next request. So:
//   - the state always comes from a fresh chain read, never from what was tapped or stored before;
//   - Retire is sent only in "ready", Remove only in "remove" (sendGated re-reads right before sending);
//   - amounts come from the same read (Retire <= inactive, Remove = the whole retired balance).
import { MIN_NEW_STAKER_NIM, toLuna } from './config.js'
import { BLOCK_MS, releaseBlockOf } from './release.js'

// stake   : nothing inactive or retired, the goal's NIM is still active        -> step 1 (Stop staking)
// waiting : inactive NIM, block < releaseBlock                                   -> nothing to send, show the time
// ready   : inactive NIM, block >= releaseBlock                                  -> step 2 (Retire)
// remove  : retired NIM                                                          -> step 3 (Remove)
// pay     : nothing inactive or retired, unlock started, wallet covers the goal  -> pay the shop
// Other NIM may stay staked in "pay" (the test account keeps 1,362 NIM active): only inactive and retired must be 0.
export const STEP_OF = { stake: 'deactivate', waiting: 'retire', ready: 'retire', remove: 'remove', pay: null }
// The state each step needs at the moment it is sent.
export const NEEDS = { deactivate: 'stake', retire: 'ready', remove: 'remove' }
// Steps the chain shows as done, per state.
export const DONE = { stake: [], waiting: ['deactivate'], ready: ['deactivate'], remove: ['deactivate', 'retire'], pay: ['deactivate', 'retire', 'remove'] }

const n = (v) => Number(v ?? 0)
const L_MIN = toLuna(MIN_NEW_STAKER_NIM)

// read: {
//   staker     merged staker from readStaker (luna), null when there is none
//   block      current block height
//   walletNim  spendable NIM over all shared addresses (staked NIM excluded)
//   goalNim    the goal's NIM (what it saved)
//   othersNim  NIM other goals still keep staked (status saving); the active stake must cover them too
//   started    the user started this goal's unlock (status unlocking or ready)
//   demo       demo wallet: its own unlock has no inactiveFrom and releases at once
// }
// Balances returned in luna. Throws when the chain read cannot decide (inactive NIM without inactiveFrom, no block).
export function unlockStateOf({ staker, block, walletNim, goalNim, othersNim = 0, started = false, demo = false, now = Date.now() }) {
  const st = staker || {}
  const active = n(st.balance ?? st.activeBalance)
  const inactive = n(st.inactiveBalance)
  const retired = n(st.retiredBalance)
  const from = Number(st.inactiveFrom)
  const base = {
    block: Number(block), active, inactive, retired, inactiveFrom: from > 0 ? from : null,
    releaseBlock: null, releaseAt: null, walletNim: n(walletNim), goalNim: n(goalNim), short: false,
  }
  if (retired > 0) return { ...base, state: 'remove' }
  if (inactive > 0) {
    if (!(from > 0)) {
      if (demo) return { ...base, state: 'ready' }
      throw new Error('Staker has inactive NIM but no inactiveFrom: cannot tell when it is released')
    }
    if (!(Number(block) > 0)) throw new Error('No block height: cannot tell whether the NIM is released')
    const releaseBlock = releaseBlockOf(from)
    const left = Math.max(0, releaseBlock - Number(block))
    return { ...base, releaseBlock, releaseAt: now + left * BLOCK_MS, state: left > 0 ? 'waiting' : 'ready' }
  }
  const goal = toLuna(goalNim)
  const stillActive = active >= goal + toLuna(othersNim)
  if (started && !stillActive && n(walletNim) >= n(goalNim)) return { ...base, state: 'pay' }
  // short: the active stake does not hold this goal's NIM, so there is nothing to stop (ledger and chain disagree).
  return { ...base, state: 'stake', short: !(goal > 0) || active < goal }
}

// Amount (luna) for a step, from the same read. null when the step cannot be sent from this state.
//   deactivate: new active stake = active - goal; a rest under 100 NIM goes to 0 (active + inactive: 0 or >= 100).
//   retire:     min(goal, inactive), never more than inactive.
//   remove:     the whole retired balance (the chain refuses a part of it).
export function amountFor(step, us) {
  if (!us || us.state !== NEEDS[step]) return null
  const goal = toLuna(us.goalNim)
  if (step === 'deactivate') {
    if (us.short) return null
    const rest = us.active - goal
    return rest < L_MIN ? 0 : rest
  }
  if (step === 'retire') return Math.min(goal, us.inactive)
  if (step === 'remove') return us.retired
  return null
}

// Hard gate: re-reads the state right before sending and opens Nimiq Pay only when the chain allows the step.
// readState(): fresh unlockStateOf result. send(step, luna): the Nimiq Pay call. Throws an error with .gate
// ({ step, us }) without sending when the state does not match; e.g. Retire while "waiting".
export async function sendGated(step, { readState, send }) {
  const us = await readState()
  const luna = amountFor(step, us)
  if (luna == null) {
    const e = new Error(`Unlock step ${step} not allowed in state ${us?.state}`)
    e.gate = { step, us }
    throw e
  }
  const tx = await send(step, luna)
  return { tx, us, luna }
}
