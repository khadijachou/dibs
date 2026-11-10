// What to tell the user when a card already has an open goal (one open goal per card).
// Three places: a new goal redirected ('new'), Change card blocked ('change'), an empty duplicate kept after the
// merge on start ('merge'). When the open goal is unlocking, the message follows its chain state instead.
import { itemName } from './itemName.js'

// Only goals in their unlock need a chain read (getUnlockState) to pick the message.
export const needsChainRead = (g) => g?.status === 'unlocking' || g?.status === 'ready'

const PLAIN = { new: 'goal_exists', change: 'change_exists', merge: 'goal_duplicate' }

// us: getUnlockState(existing) or null (not read yet, or the chain could not be read: never guess, plain message).
export function duplicateMessage(place, existing, us) {
  if (needsChainRead(existing) && us) {
    if (us.state === 'waiting' && us.releaseAt != null) return { key: 'dup_unlocking', releaseAt: us.releaseAt }
    if (us.state === 'ready' || us.state === 'remove' || us.state === 'pay') return { key: 'dup_ready' }
  }
  return { key: PLAIN[place] }
}

// fmtTime: (ms) => text, readyTimeText from ReleaseClock.jsx in the app.
export const duplicateText = (t, existing, msg, fmtTime) =>
  t(msg.key, { name: itemName(t, existing), time: msg.releaseAt != null ? fmtTime(msg.releaseAt) : '' })
