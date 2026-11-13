// Savings top card (screens/Stake.jsx): how the total splits for display, from stakeSummary()'s total, other and
// leaving (lib/earned.js computes those; nothing here changes them). Plain JS so node --test can load it.
// unlocking = leaving, outside = other, earning in goals = the rest. Each is clamped so the three never go below 0
// and always add up to total, even if a chain read and the ledger briefly disagree.
export const MIN_SHOWN = 1 // a segment or row under 1 NIM is not shown (earning in goals keeps its row)

const pos = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 0)

export function stakeSplit({ total, other, leaving }) {
  const all = pos(total)
  const unlocking = Math.min(pos(leaving), all)
  const outside = Math.min(pos(other), all - unlocking)
  const earning = Math.max(0, all - unlocking - outside)
  return { total: all, earning, outside, unlocking }
}

// The bar's segments, in order, without the ones under 1 NIM; share is the width (0 to 1) over what is shown.
export function splitSegments(split) {
  const parts = [
    { key: 'earning', nim: split.earning },
    { key: 'outside', nim: split.outside },
    { key: 'unlocking', nim: split.unlocking },
  ].filter((p) => p.nim >= MIN_SHOWN)
  const sum = parts.reduce((s, p) => s + p.nim, 0)
  return parts.map((p) => ({ ...p, share: sum > 0 ? p.nim / sum : 0 }))
}
