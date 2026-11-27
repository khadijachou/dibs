// Copy diagnostics (More > Need help?): a plain-text snapshot of what Dibs sees on this phone, for support.
// Pure: no storage, no network, no React, no Date.now. Everything it needs is in `state` (now is passed in).
// It reads only the fields it needs and copies nothing private: no email, no payment (orderId, orderToken, hash,
// swapId, code, pin, link), no tx hashes, no stats id, no name, no user text, and never a full address.
// The output is always English, for support. buildDiagnostics(state) returns the whole text.

import { checkedPool } from './pools.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n) => String(n).padStart(2, '0')
const MINUS = '−' // a minus sign, not a hyphen and not an em dash

// NIM figures: thousands separators in English (19,501), no decimals except when below 1 (0.5).
function fmtNum(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '0'
  if (x !== 0 && Math.abs(x) < 1) return x.toLocaleString('en-US', { maximumFractionDigits: 5 })
  return Math.round(x).toLocaleString('en-US')
}
// A signed figure for the Difference line: "+9,081", "−1,200", or "0".
function signed(n) {
  const x = Number(n) || 0
  if (x > 0) return `+${fmtNum(x)}`
  if (x < 0) return `${MINUS}${fmtNum(-x)}`
  return '0'
}

// The first group and the last group of an address, "NQ12 … ABCD", whatever spacing the input has.
// Never a full address: a no-space address is cut to its first four and last four characters.
function short(address) {
  const s = String(address == null ? '' : address).trim()
  if (!s) return '?'
  const groups = s.split(/\s+/)
  if (groups.length > 1) return `${groups[0]} … ${groups[groups.length - 1]}`
  if (s.length <= 8) return s
  return `${s.slice(0, 4)} … ${s.slice(-4)}`
}
const sameAddr = (a, b) => {
  if (a == null || b == null) return false
  const norm = (x) => String(x).replace(/\s+/g, '').toUpperCase()
  return norm(a) === norm(b)
}

// A ms timestamp (or an ISO string) rendered in the phone's local time. Returns null on bad input.
function localParts(ms, tzOffsetMin) {
  const t = typeof ms === 'number' ? ms : Date.parse(ms)
  if (!Number.isFinite(t)) return null
  const d = new Date(t + (Number(tzOffsetMin) || 0) * 60000)
  return { day: d.getUTCDate(), mon: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(), hh: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()) }
}
// "5 Nov 2026 14:30"
function dateTime(ms, tz) {
  const p = localParts(ms, tz)
  return p ? `${p.day} ${p.mon} ${p.year} ${p.hh}:${p.mm}` : '?'
}
// "5 Nov 14:30" (no year), for a goal's last change.
function dayTime(ms, tz) {
  const p = localParts(ms, tz)
  return p ? `${p.day} ${p.mon} ${p.hh}:${p.mm}` : 'unknown'
}
// "UTC+0", "UTC+5:30", "UTC−3:30"
function utc(tzOffsetMin) {
  const o = Number(tzOffsetMin) || 0
  const abs = Math.abs(o)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const sign = o < 0 ? MINUS : '+'
  return `UTC${sign}${h}${m ? `:${pad(m)}` : ''}`
}

// Only the fields Dibs may show for a goal. Never itemName, itemDetail, payment, deposits' or steps' tx, or any
// other field: a private value stuffed anywhere else is never reached.
const savedNim = (goal) => (Array.isArray(goal?.deposits) ? goal.deposits : []).reduce((s, d) => s + (Number(d?.nim) || 0), 0)
const brandOf = (goal) => String(goal?.brandName || goal?.brandKey || '?').replace(/\s*gift\s*card\s*$/i, '').trim() || '?'
const valueOf = (goal) => [goal?.faceValue, goal?.currency].filter(Boolean).join(' ')
const id4 = (goal) => String(goal?.id || '').slice(0, 4)
const stepsOf = (goal) => (Array.isArray(goal?.unlockSteps) ? goal.unlockSteps.length : 0)
const depositsOf = (goal) => (Array.isArray(goal?.deposits) ? goal.deposits.length : 0)
const changedMs = (goal) => goal?.updatedAt || goal?.createdAt || null

export function buildDiagnostics(state) {
  const s = state && typeof state === 'object' ? state : {}
  const tz = Number(s.tzOffsetMin) || 0
  const goalsShown = Array.isArray(s.goalsShown) ? s.goalsShown : []
  const out = []

  out.push(`Dibs diagnostics · v${s.version ?? '?'} · ${dateTime(s.now, tz)} (${utc(tz)})`)
  out.push(`Mode: ${s.demo ? 'Demo mode' : 'Nimiq Pay'} · Language: ${s.lang ?? '?'}`)
  out.push('')

  // Wallet addresses
  if (!Array.isArray(s.accounts)) {
    out.push('Wallet addresses: unavailable')
  } else {
    out.push('Wallet addresses (as Nimiq Pay lists them)')
    for (const a of s.accounts) {
      const used = sameAddr(a?.address, s.usedAddress) ? '  (used by Dibs)' : ''
      const nim = a?.nim == null ? '?' : fmtNum(a.nim)
      out.push(`  ${short(a?.address)}  ${nim} NIM${used}`)
    }
  }
  out.push('')

  // Staking (read from the chain)
  const total = goalsShown
    .filter((g) => g?.status === 'saving' || g?.status === 'unlocking')
    .reduce((n, g) => n + savedNim(g), 0)
  if (s.staker === 'error') {
    out.push('Staking: unavailable')
  } else {
    out.push('Staking (read from the chain)')
    const st = s.staker && typeof s.staker === 'object' ? s.staker : null
    const active = Number(st?.active) || 0
    const inactive = Number(st?.inactive) || 0
    const retired = Number(st?.retired) || 0
    if (!st) {
      out.push('  no staker')
    } else {
      const addrs = Array.isArray(st.stakers) && st.stakers.length ? st.stakers.map(short).join(', ') : short(st.address)
      // The pool is named by the same rule as poolName (lib/pools.js checkedPool): the baked name for a checked
      // address, a shortened address for any other, "validator unknown" when the delegation is missing.
      const validator = st.delegation == null ? 'validator unknown'
        : checkedPool(st.delegation)?.name || short(st.delegation)
      out.push(`  ${addrs}  active ${fmtNum(active)} · inactive ${fmtNum(inactive)} · retired ${fmtNum(retired)} · ${validator}`)
    }
    out.push(`  Total in goals that should be staked: ${fmtNum(total)}`)
    // Always whole NIM: a tiny gap reads "0", never "+0.00034".
    out.push(`  Difference: ${signed(Math.round(total - (active + inactive)))} NIM`)
  }
  out.push('')

  // Goals Dibs shows
  out.push('Goals Dibs shows')
  for (const g of goalsShown) {
    const nDep = depositsOf(g)
    out.push(`  ${brandOf(g)} ${valueOf(g)} · ${id4(g)} · ${g?.status ?? '?'} · ${fmtNum(savedNim(g))} NIM · ${nDep} deposit${nDep === 1 ? '' : 's'} · ${stepsOf(g) || 'no'} unlock steps · changed ${dayTime(changedMs(g), tz)}`)
  }
  out.push('')

  // Every saved copy (address · goal · card · status · NIM · steps · changed)
  out.push('Every saved copy (address · goal · card · status · NIM · steps · changed)')
  const copies = (Array.isArray(s.copies) ? s.copies : []).slice().sort((a, b) => {
    const ia = String(a?.goal?.id || '')
    const ib = String(b?.goal?.id || '')
    if (ia !== ib) return ia < ib ? -1 : 1
    const ta = Date.parse(a?.goal?.updatedAt) || 0
    const tb = Date.parse(b?.goal?.updatedAt) || 0
    return tb - ta // newest first
  })
  // When the one main list exists, Dibs shows it, so "<- shown" marks the main-list copies; otherwise, as before,
  // the copies under the used address. The old per-address copies are listed either way, by their address.
  const hasMain = copies.some((c) => c?.main)
  const matchesShown = (c) => goalsShown.some((g) => g?.id === c?.goal?.id && String(g?.updatedAt) === String(c?.goal?.updatedAt))
  const isShown = (c) => matchesShown(c) && (hasMain ? Boolean(c?.main) : sameAddr(c?.address, s.usedAddress))
  for (const c of copies) {
    const g = c?.goal
    const mark = isShown(c) ? '  <- shown' : ''
    const addrCol = c?.main ? 'main list' : short(c?.address)
    out.push(`  ${addrCol}  ${brandOf(g)} ${id4(g)}  ${valueOf(g)}  ${g?.status ?? '?'}  ${fmtNum(savedNim(g))}  ${stepsOf(g)}  ${dayTime(changedMs(g), tz)}${mark}`)
  }
  out.push('')

  // Other
  out.push('Other')
  out.push(`  Payment being checked: ${s.pendingPay ? 'yes' : 'no'}`)
  out.push(`  Unlock in progress: ${goalsShown.some((g) => g?.status === 'unlocking') ? 'yes' : 'no'}`)
  out.push(`  Deleted goals on this phone: ${Number(s.deletedCount) || 0}`)
  // NIM put back in staking (dibs.restakes, lib/restake.js): a count and the last one; never a hash.
  const rs = s.restakes
  out.push(rs && rs.count
    ? `  NIM put back in staking: ${rs.count} time(s), last ${dayTime(rs.last?.at, tz)} (${fmtNum(rs.last?.nim)} NIM)`
    : '  NIM put back in staking: never')
  // Whether Friends is on. Never the device secret or the demo wallet key (gather does not read them).
  out.push(`  Friends: ${s.friendsOn ? 'on' : 'off'}`)
  // Leaderboards: which boards are joined. The app no longer reports deposits, so there is nothing else to show here.
  const b = s.boards
  const joined = b && (b.friends || b.global) ? (b.friends && b.global ? 'both' : b.friends ? 'friends' : 'global') : 'no'
  out.push(`  Leaderboards: joined ${joined}`)

  return out.join('\n')
}

// Gathers the state for buildDiagnostics with READS ONLY. Every impure thing is injected so this stays testable
// against a fake storage and stubbed chain reads, and so the module itself never touches localStorage, the network,
// React, or Date.now: the component passes `now` and `tzOffsetMin` in, and the safe chain reads as functions.
//   storage       a localStorage-like object (getItem, and Object.keys lists its keys)
//   listAccounts  lib/nimiq listAccountsWithBalance (read only: provider accounts and balances)
//   readStaker    lib/nimiq readStaker for usedAddress (read only: the chain). getStaker/readStaker never write.
// Never calls any send, deposit, unlock or pay function, and never writes a key. A read that fails becomes 'error'
// for that part only (accounts or staking), the rest still gathers.
const LUNA = 100_000
const readJSON = (storage, k) => { try { return JSON.parse(storage.getItem(k)) } catch { return null } }

export async function gather({ storage, now, tzOffsetMin, version, lang, demo, usedAddress, validatorAddress, listAccounts, readStaker }) {
  let accounts = 'error'
  try {
    const list = await listAccounts()
    accounts = (Array.isArray(list) ? list : []).map((a) => ({ address: a?.address, nim: a?.nim }))
  } catch { accounts = 'error' }

  let staker = null
  try {
    const st = await readStaker(usedAddress)
    if (st && typeof st === 'object') {
      staker = {
        active: Number(st.balance ?? st.activeBalance ?? 0) / LUNA,
        inactive: Number(st.inactiveBalance ?? 0) / LUNA,
        retired: Number(st.retiredBalance ?? 0) / LUNA,
        delegation: st.delegation ?? null,
        stakers: Array.isArray(st.stakers) && st.stakers.length ? st.stakers : (st.address ? [st.address] : []),
      }
    } else staker = null // "No staker": a clean null, not an error
  } catch { staker = 'error' }

  // v1.2.9: goals live in one key (dibs.goals). Dibs shows that list when it exists; before the move, the old
  // per-address key as before. The old dibs.goals.<address> keys stay listed in "Every saved copy" as they are.
  const mainList = readJSON(storage, 'dibs.goals')
  const shownRaw = Array.isArray(mainList) ? mainList : readJSON(storage, `dibs.goals.${usedAddress}`)
  const goalsShown = Array.isArray(shownRaw) ? shownRaw : []

  const copies = []
  if (Array.isArray(mainList)) for (const goal of mainList) if (goal) copies.push({ address: 'main list', main: true, goal })
  let keys = []
  try { keys = Object.keys(storage).filter((k) => k.startsWith('dibs.goals.')) } catch { keys = [] }
  for (const k of keys) {
    const list = readJSON(storage, k)
    if (!Array.isArray(list)) continue
    const address = k.slice('dibs.goals.'.length)
    for (const goal of list) if (goal) copies.push({ address, goal })
  }

  const pay = readJSON(storage, 'dibs.pending') // the payment-check record (kind 'pay'), written by Redeem; read only here
  const del = readJSON(storage, 'dibs.deleted')
  const restakesRaw = readJSON(storage, 'dibs.restakes') // the restake log (lib/restake.js): { at, nim, tx }, last 20
  const restakeArr = Array.isArray(restakesRaw) ? restakesRaw : []
  const lastR = restakeArr.length ? restakeArr[restakeArr.length - 1] : null
  // Only whether Friends is on (dibs.friends.on). The device secret key and the demo wallet key are never read.
  const friends = readJSON(storage, 'dibs.friends')
  // Leaderboards: only the board choice (the app no longer reports deposits, so no hash and nothing else to read).
  const boards = readJSON(storage, 'dibs.boards')
  return {
    version, now, tzOffsetMin, lang, demo,
    accounts, usedAddress, staker, validatorAddress,
    goalsShown, copies,
    pendingPay: Boolean(pay && pay.kind === 'pay'),
    deletedCount: Array.isArray(del) ? del.length : 0,
    restakes: { count: restakeArr.length, last: lastR ? { at: lastR.at, nim: lastR.nim } : null }, // never the tx hash
    friendsOn: Boolean(friends?.on),
    boards: boards && typeof boards === 'object' ? { friends: Boolean(boards.friends), global: Boolean(boards.global) } : null,
  }
}
