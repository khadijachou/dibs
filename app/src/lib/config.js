// All settings come from Vite env vars (see .env.example). Nothing secret lives here:
// everything in this file ends up in the browser bundle.
const env = import.meta.env

export const config = {
  defaultValidator: (env.VITE_DEFAULT_VALIDATOR || '').trim(),
  rpcUrl: (env.VITE_NIMIQ_RPC_URL || '').trim(),
  redeemMode: env.VITE_REDEEM_MODE === 'manual' ? 'manual' : 'api',
  apiUrl: (env.VITE_API_URL || '').replace(/\/$/, ''),
  fallbackNimUsd: Number(env.VITE_FALLBACK_NIM_USD || 0.0003),
}

export const LUNA_PER_NIM = 100_000
export const MIN_NEW_STAKER_NIM = 100

export const toLuna = (nim) => Math.round(Number(nim) * LUNA_PER_NIM)
export const toNim = (luna) => Number(luna) / LUNA_PER_NIM
