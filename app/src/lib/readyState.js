// A ready goal (NIM released, back in the wallet): does what it saved still cover the card at today's price?
// Display only. Nothing here sends a transaction or changes the goal's target; checkout gives the exact price.
import { savedNim } from './goals.js'
import { usdToNim } from './price.js'

// BUG-17: an item with live: false has no shop quote; its usd is the catalogue's stored placeholder.
// Its NIM price gets a 10 % safety margin so the user does not fall short when the shop confirms the price.
// Plan (goal target) and the ready states below use the same rule.
export const SAFETY_MARGIN = 0.1
export const targetUsdOf = (item) => (item.live === false ? item.usd * (1 + SAFETY_MARGIN) : item.usd)

// NIM the payment can use beyond the ready goals' own saved NIM. walletNim: spendable NIM over every shared address
// (lib/nimiq.js walletNim, staked NIM excluded), where Remove puts the released NIM and where payLightningInvoice
// pays from. Every ready goal's saved NIM sits in that same wallet and is kept for its own card, so it is not free.
export function freeNimOf(walletNim, goals = []) {
  if (walletNim == null || !Number.isFinite(Number(walletNim))) return null
  const reserved = goals.filter((g) => g?.status === 'ready').reduce((s, g) => s + Math.max(0, savedNim(g)), 0)
  return Math.max(0, Math.floor(Number(walletNim) - reserved))
}

// kind: 'covered' (gap 0) | 'wallet' (0 < gap <= freeNim) | 'short' (gap > freeNim).
// price: the card today in NIM (Plan's rule), or the goal's target when the item or the prices are missing.
// estimated: the item has no live shop price (its price is confirmed at checkout).
export function readyState(goal, item, prices, freeNim) {
  const saved = savedNim(goal)
  const price = item && item.usd != null && prices?.nimUsd ? usdToNim(targetUsdOf(item), prices.nimUsd) : goal.targetNim
  const gap = Math.max(0, Math.ceil(price - saved))
  const free = Math.max(0, Math.floor(Number(freeNim) || 0))
  const kind = gap === 0 ? 'covered' : gap <= free ? 'wallet' : 'short'
  return { kind, saved, price, gap, free, toAdd: kind === 'short' ? gap - free : 0, estimated: item?.live === false }
}
