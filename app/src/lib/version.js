// A goal's card version (USA, Europe, UK, Nigeria), its face currency and its works-with line.
// Goals keep them from the item at creation and on a card change; goals made before card versions (11 Nov) have
// none and read them from their item (all of those were USA cards, except Netflix Europe, whose item says Europe).
import { findItem } from './catalog.js'

const FROM_CURRENCY = { USD: 'USA', EUR: 'Europe', GBP: 'UK', NGN: 'Nigeria' }
const currencyOfDetail = (detail) => /\s([A-Z]{3})$/.exec(String(detail || '').trim())?.[1] || null

export function goalVersion(goal) {
  const item = goal ? findItem(goal.itemId) : null
  const currency = goal?.currency || item?.currency || currencyOfDetail(goal?.itemDetail) || 'USD'
  return {
    region: goal?.region || item?.region || FROM_CURRENCY[currency] || 'USA',
    currency,
    worksWith: goal?.worksWith || item?.worksWith || null,
  }
}

// The version fields a goal stores from its item (createGoal, cardChangePatch).
export const versionOf = (item) => ({ region: item?.region || 'USA', currency: item?.currency || currencyOfDetail(item?.detail) || null, worksWith: item?.worksWith || null })
