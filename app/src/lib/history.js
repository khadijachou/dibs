// One timeline built from the goals on this device (History tab, Report a problem).
// Read only: the ledger in goals.js stays the only writer.

// Nimiq Pay returns a hash string, older hosts an object: keep the string either way.
export const txHash = (tx) => (typeof tx === 'string' ? tx : tx?.hash || tx?.transactionHash || '') || ''
export const shortHash = (h) => (h && h.length > 14 ? `${h.slice(0, 6)}…${h.slice(-6)}` : h || '')

// NIM a goal held before any withdrawal (what was unlocked or spent).
const heldNim = (g) => g.deposits.filter((d) => d.kind !== 'withdraw').reduce((s, d) => s + d.nim, 0)
const label = (g) => `${g.itemName} · ${g.itemDetail}`
// nameOf / rawName: how goals and stored move labels are named on screen (History passes translated ones).

// Event: { id, type: deposit|move|unlock|withdraw|purchase, at, nim, goal, goalId, tx?, step?, from?, to? }
export function buildTimeline(goals, nameOf = label, rawName = (s) => s) {
  const out = []
  // A move writes two rows (−nim on the source, +nim on the target). Show it once, from the source side,
  // unless the source goal was deleted and only the target row is left.
  const moveKey = (d) => `${d.at}|${Math.abs(d.nim)}`
  const sourceRows = new Set()
  for (const g of goals) for (const d of g.deposits) if (d.kind === 'move' && d.to) sourceRows.add(moveKey(d))

  for (const g of goals) {
    const name = nameOf(g)
    for (const d of g.deposits) {
      const base = { goal: name, goalId: g.id, at: d.at }
      if (!d.kind) out.push({ ...base, id: `d-${d.id || d.at}`, type: 'deposit', nim: d.nim, tx: txHash(d.tx) })
      else if (d.kind === 'move' && d.to) out.push({ ...base, id: `m-${d.id || d.at}`, type: 'move', nim: Math.abs(d.nim), from: name, to: rawName(d.name || '') })
      else if (d.kind === 'move' && d.from && !sourceRows.has(moveKey(d))) out.push({ ...base, id: `m-${d.id || d.at}`, type: 'move', nim: d.nim, from: rawName(d.name || ''), to: name })
      else if (d.kind === 'withdraw') out.push({ ...base, id: `w-${d.id || d.at}`, type: 'withdraw', nim: Math.abs(d.nim) })
    }
    const held = heldNim(g)
    for (const s of g.unlockSteps || []) {
      out.push({ id: `u-${g.id}-${s.step}`, type: 'unlock', step: s.step, at: s.at, nim: held, goal: name, goalId: g.id, tx: txHash(s.tx) })
    }
    if (g.status === 'redeemed' && g.payment) {
      out.push({ id: `p-${g.id}`, type: 'purchase', at: g.payment.at || g.createdAt, nim: held, goal: name, goalId: g.id, tx: txHash(g.payment.hash) })
    }
  }
  return out.filter((e) => e.at).sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

// Newest transaction hash on this device, for Report a problem.
export const lastTxHash = (goals) => buildTimeline(goals).find((e) => e.tx)?.tx || ''
