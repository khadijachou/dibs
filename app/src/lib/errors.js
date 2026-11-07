// Error handling (error plan, 5 Nov). One classifier turns any failure into an ErrorKey,
// the raw error goes to a small log (last 50, shown in the Lab), the user sees plain words.
import { NimiqProviderError } from '@nimiq/mini-app-sdk'

const LOG_KEY = 'dibs.log'
const SIM_KEY = 'dibs.simulate'

export function log(ctx, err) {
  const entry = {
    at: new Date().toISOString(), ctx,
    type: err?.type || err?.error?.type || err?.apiError || err?.name || 'Error',
    message: err?.message || err?.error?.message || String(err),
    data: err?.data ?? null,
  }
  try {
    const list = JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
    list.push(entry)
    localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-50)))
  } catch { /* storage blocked */ }
  console.warn('[dibs]', entry)
  return entry
}
export const readLog = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') } catch { return [] } }
export const lastLogText = () => JSON.stringify(readLog().slice(-1)[0] || {}, null, 2)

// ctx: deposit | unlock | pay | invoice | api
export function classify(err, ctx) {
  log(ctx, err)
  const type = NimiqProviderError.is(err) ? err.type : err?.type || err?.error?.type
  if (type === 'PERMISSION_DENIED') return ctx === 'pay' ? 'PAY_CANCELLED' : 'DEP_CANCELLED'
  if (type === 'DUPLICATE_PAYMENT') return 'PAY_DUPLICATE'
  if (type === 'TRANSACTION_OUTCOME_UNKNOWN') return 'PAY_UNKNOWN'
  // Staking refusals: codes not known yet (record them on the mainnet run).
  if (ctx === 'unlock' && type) return 'UNL_NOT_RELEASED'
  if (err?.apiError) return err.apiError
  if (err?.name === 'AbortError' || err instanceof TypeError) return 'SRV_DOWN'
  return 'GENERIC'
}

// Demo only: open the app with ?sim=KEY to make the next matching call fail with that error.
// Example: http://localhost:5173/?sim=PAY_UNKNOWN . ?sim=off clears it.
const SIM = {
  DEP_CANCELLED: { ctx: 'deposit', type: 'PERMISSION_DENIED' },
  // The deposit is sent, then Nimiq Pay reports an error anyway (BUG-01, Angelo's case).
  DEP_SENT_ERROR: { ctx: 'deposit-sent', type: 'SOMETHING_NEW' },
  PAY_CANCELLED: { ctx: 'pay', type: 'PERMISSION_DENIED' },
  PAY_UNKNOWN: { ctx: 'pay', type: 'TRANSACTION_OUTCOME_UNKNOWN' },
  PAY_DUPLICATE: { ctx: 'pay', type: 'DUPLICATE_PAYMENT' },
  UNL_NOT_RELEASED: { ctx: 'unlock', type: 'INVALID_TRANSACTION' },
  GENERIC: { ctx: 'deposit', type: 'SOMETHING_NEW' },
  SHOP_LIMIT: { ctx: 'invoice', api: 'SHOP_LIMIT' },
  SRV_DOWN: { ctx: 'invoice', api: 'SRV_DOWN' },
}
export function readSimulateParam() {
  const m = location.search.match(/[?&]sim=([A-Z_]+|off)/)
  if (!m) return
  try { m[1] === 'off' ? localStorage.removeItem(SIM_KEY) : localStorage.setItem(SIM_KEY, m[1]) } catch { /* ignore */ }
}
export function simulated(ctx) {
  let key
  try { key = localStorage.getItem(SIM_KEY) } catch { return }
  const s = SIM[key]
  if (!s || s.ctx !== ctx) return
  try { localStorage.removeItem(SIM_KEY) } catch { /* ignore */ }
  const e = new Error(`Simulated ${key}`)
  if (s.api) e.apiError = s.api
  else e.error = { type: s.type, message: `Simulated ${key}` }
  throw e
}
