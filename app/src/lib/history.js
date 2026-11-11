// One timeline built from the goals on this device (History tab, Report a problem).
// Read only: the ledger in goals.js stays the only writer.

// Nimiq Pay returns a hash string, older hosts an object: keep the string either way.
export const txHash = (tx) => (typeof tx === 'string' ? tx : tx?.hash || tx?.transactionHash || '') || ''
export const shortHash = (h) => (h && h.length > 14 ? `${h.slice(0, 6)}…${h.slice(-6)}` : h || '')

// NIM a goal held before any withdrawal (what was unlocked or spent).
const heldNim = (g) => g.deposits.filter((d) => d.kind !== 'withdraw').reduce((s, d) => s + d.nim, 0)
const label = (g) => `${g.itemName} · ${g.itemDetail}`
// nameOf / rawName: how goals and stored move labels are named on screen (History passes translated ones).

// The card a goal was on at time `at` (BUG-24): the earliest card change made after `at` holds the card that was
// replaced then ({ itemName, itemDetail, usd, region }); with none, the goal's current card.
export function cardAt(g, at) {
  const later = (g.cardChanges || []).filter((c) => c?.at && String(c.at) > String(at))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))[0]
  return later || g
}

// Event: { id, type: deposit|move|unlock|withdraw|purchase|change, at, nim, goal, goalId, tx?, step?, from?, to? }
// A row is named after the card in effect at its time. A change row (no NIM moved, no tx) has from/to = the old and
// new cards, named with cardName (History adds the version).
export function buildTimeline(goals, nameOf = label, rawName = (s) => s, cardName = nameOf) {
  const out = []
  // A move writes two rows (−nim on the source, +nim on the target). Show it once, from the source side,
  // unless the source goal was deleted and only the target row is left.
  const moveKey = (d) => `${d.at}|${Math.abs(d.nim)}`
  const sourceRows = new Set()
  for (const g of goals) for (const d of g.deposits) if (d.kind === 'move' && d.to) sourceRows.add(moveKey(d))

  for (const g of goals) {
    const nameAt = (at) => nameOf(cardAt(g, at))
    for (const d of g.deposits) {
      const name = nameAt(d.at)
      const base = { goal: name, goalId: g.id, at: d.at }
      if (!d.kind) out.push({ ...base, id: `d-${d.id || d.at}`, type: 'deposit', nim: d.nim, tx: txHash(d.tx) })
      else if (d.kind === 'move' && d.to) out.push({ ...base, id: `m-${d.id || d.at}`, type: 'move', nim: Math.abs(d.nim), from: name, to: rawName(d.name || '') })
      else if (d.kind === 'move' && d.from && !sourceRows.has(moveKey(d))) out.push({ ...base, id: `m-${d.id || d.at}`, type: 'move', nim: d.nim, from: rawName(d.name || ''), to: name })
      else if (d.kind === 'withdraw') out.push({ ...base, id: `w-${d.id || d.at}`, type: 'withdraw', nim: Math.abs(d.nim) })
    }
    const held = heldNim(g)
    for (const s of g.unlockSteps || []) {
      out.push({ id: `u-${g.id}-${s.step}`, type: 'unlock', step: s.step, at: s.at, nim: held, goal: nameAt(s.at), goalId: g.id, tx: txHash(s.tx) })
    }
    if (g.status === 'redeemed' && g.payment) {
      const at = g.payment.at || g.createdAt
      out.push({ id: `p-${g.id}`, type: 'purchase', at, nim: held, goal: nameAt(at), goalId: g.id, tx: txHash(g.payment.hash) })
    }
    const changes = (g.cardChanges || []).filter((c) => c?.at).sort((a, b) => String(a.at).localeCompare(String(b.at)))
    changes.forEach((c, i) => {
      out.push({ id: `c-${g.id}-${i}`, type: 'change', at: c.at, goal: nameOf(g), goalId: g.id, from: cardName(c), to: cardName(changes[i + 1] || g) })
    })
  }
  return out.filter((e) => e.at).sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

// Newest transaction hash on this device, for Report a problem.
export const lastTxHash = (goals) => buildTimeline(goals).find((e) => e.tx)?.tx || ''
