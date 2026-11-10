// NIM rewards from the Dibs team (display and copy only). The app never sends anything: the user copies the claim
// details and emails them; the team checks the order or the deposit and pays by hand. Rules: More > Legal > Rewards.
export const PROGRAM_END = '2026-11-30T23:59:59Z'
export const REWARDS = {
  dibs: { nim: 5000, places: 20 },
  planted: { nim: 1000, places: 30, holdDays: 7 },
}
export const REWARD_IDS = ['planted', 'dibs']
export const CLAIM_EMAIL = 'calldibs.contact@gmail.com'
const DAY = 864e5

export const active = (now = Date.now()) => now < Date.parse(PROGRAM_END)

// The first deposit sent from the wallet (not a move between goals, not a withdrawal), across every goal on this device.
export function firstDeposit(goals = []) {
  return goals.flatMap((g) => (g.deposits || []).filter((d) => d.nim > 0 && d.kind !== 'move' && d.kind !== 'withdraw'))
    .filter((d) => Number.isFinite(Date.parse(d.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0] || null
}

// The first card bought (earliest payment), for its order id.
export function firstRedeemed(goals = []) {
  return goals.filter((g) => g.status === 'redeemed')
    .sort((a, b) => String(a.payment?.at || a.createdAt).localeCompare(String(b.payment?.at || b.createdAt)))[0] || null
}

// { state: 'not' | 'wait' | 'claim', date? }. not: badge not earned. wait (planted): less than 7 days since the
// first deposit; date = that deposit + 7 days (ISO). claim: the user can claim it.
export function state(id, { badges = {}, goals = [], now = Date.now() } = {}) {
  if (!REWARDS[id] || !badges[id]) return { state: 'not' }
  if (id === 'planted') {
    const d = firstDeposit(goals)
    if (d) {
      const from = Date.parse(d.at) + REWARDS.planted.holdDays * DAY
      if (now < from) return { state: 'wait', date: new Date(from).toISOString() }
    }
  }
  return { state: 'claim' }
}

// "NQ15HNAH…" or "nq15 hnah …" -> "NQ15 HNAH …" (groups of 4).
export const groupAddress = (a) => (String(a || '').replace(/\s+/g, '').toUpperCase().match(/.{1,4}/g) || []).join(' ')

// The text lines the user copies into the claim email.
export function claimDetails(id, { goals = [], walletAddress = '', t }) {
  const lines = [`${t('rw_d_reward')}: ${t(`badge_${id}`)}`]
  if (id === 'planted') lines.push(`${t('rw_d_tx')}: ${firstDeposit(goals)?.tx || '-'}`)
  if (id === 'dibs') lines.push(`${t('rw_d_order')}: ${firstRedeemed(goals)?.payment?.orderId || '-'}`)
  lines.push(`${t('rw_d_address')}: ${groupAddress(walletAddress) || '-'}`)
  return lines
}
