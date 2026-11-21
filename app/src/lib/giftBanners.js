// Gift banners (v1.7.2): eleven banner designs the sender can put on a gift (components/GiftBanner.jsx draws them).
// Four are free (chosen since v1.7.1); seven more the sender unlocks by reaching a level on THIS phone. Looks only:
// nothing here pays NIM or grants XP, and the receiver sees whatever banner the sender chose, whatever her own level.
// Pure logic plus one small "seen" pointer for the one-time level-up toast; the banner CHOICE lives on the gift itself
// (friends/src/gifts.js markSent, lib/gifts.js). The server (friends/src/rules.js GIFT_BANNERS) accepts every id here.
import { RANKS } from './xp.js'

// The four free banners (no level). Their titles use the v1.7.1 keys (frd_banner_*).
export const FREE_BANNERS = ['birthday', 'thanks', 'congrats', 'because']

// The seven level banners, in level order. `rank` reads the unlock level from lib/xp.js RANKS (no second copy); `level`
// is set directly for the two that sit between ranks (love 3, gamer 15). `line` is the i18n key of the bottom-left line.
const LEVEL_DEFS = [
  { id: 'love', line: 'gb_love', level: 3 },
  { id: 'saver', line: 'gb_saver', rank: 'saver' },
  { id: 'planner', line: 'gb_planner', rank: 'planner' },
  { id: 'gamer', line: 'gb_gamer', level: 15 },
  { id: 'collector', line: 'gb_collector', rank: 'collector' },
  { id: 'treasurer', line: 'gb_treasurer', rank: 'treasurer' },
  { id: 'legend', line: 'gb_legend', rank: 'legend' },
]
const rankLevel = (rankId) => (RANKS.find((r) => r.id === rankId) || RANKS[0]).level
// The seven level banners with their resolved unlock level, in level order.
export const LEVEL_BANNERS = LEVEL_DEFS.map((b) => ({ id: b.id, line: b.line, level: b.level ?? rankLevel(b.rank) }))
export const LEVEL_BANNER_IDS = LEVEL_BANNERS.map((b) => b.id)
// Every banner id the app knows (free then level), in the server's order.
export const ALL_BANNER_IDS = [...FREE_BANNERS, ...LEVEL_BANNER_IDS]

// The level a given level-banner unlocks at (Infinity for a free banner or an unknown id).
export const levelFor = (id) => { const e = LEVEL_BANNERS.find((b) => b.id === id); return e ? e.level : Infinity }
export const isUnlocked = (id, level) => level >= levelFor(id)
// The level banners available at this level (as entries { id, line, level }).
export const unlockedBanners = (level) => LEVEL_BANNERS.filter((b) => level >= b.level)

// The i18n line key for any banner id (free or level), or null for an unknown id. Used by the list, the toast and the
// rank sheet line.
const LINE_KEY = {
  birthday: 'frd_banner_birthday', thanks: 'frd_banner_thanks', congrats: 'frd_banner_congrats', because: 'frd_banner_because',
  ...Object.fromEntries(LEVEL_BANNERS.map((b) => [b.id, b.line])),
}
export const lineKey = (id) => LINE_KEY[id] || null

// The level banner a rank unlocks (the banner whose id matches the rank id: saver/planner/collector/treasurer/legend),
// or null for a rank with no banner (starter). For the line added to the rank-reached sheet (components/LookParts.jsx).
export const bannerForRank = (rankId) => LEVEL_BANNERS.find((b) => b.id === rankId) || null

// ---- the one-time "new gift banner" toast for the two between-rank levels (love 3, gamer 15) ------------------
// The rank banners (5/10/20/35/50) ride the rank-reached sheet; the two between ranks have no sheet, so they get a
// one-time toast on the next launch after the level is reached. dibs.gbSeen holds the highest between-rank banner level
// already announced. First run of this version seeds it with the highest such level already reached, so an update never
// fires a toast for a banner the user had before it (like lib/seen.js levelBandToAnnounce). Pure apart from this store.
const GB_SEEN = 'dibs.gbSeen'
// The level banners that are NOT ranks (their level matches no RANKS entry): love (3) and gamer (15).
export const BETWEEN_BANNERS = LEVEL_BANNERS.filter((b) => !RANKS.some((r) => r.level === b.level))
const readSeen = () => { try { const raw = localStorage.getItem(GB_SEEN); if (raw == null) return null; const v = Number(raw); return Number.isFinite(v) ? v : null } catch { return null } }
const writeSeen = (n) => { try { localStorage.setItem(GB_SEEN, String(n)) } catch { /* private mode */ } }

// The between-rank banner to announce once (the lowest not yet announced that the user has reached), or null. First run
// seeds silently and returns null. One per launch: the pointer advances to the announced level, so the next launch gets
// the next banner.
export function gbToAnnounce(level) {
  const seen = readSeen()
  if (seen == null) { writeSeen(Math.max(0, ...BETWEEN_BANNERS.filter((b) => b.level <= level).map((b) => b.level))); return null }
  const next = BETWEEN_BANNERS.filter((b) => b.level <= level && b.level > seen).sort((a, b) => a.level - b.level)[0]
  if (!next) return null
  writeSeen(next.level)
  return next
}
