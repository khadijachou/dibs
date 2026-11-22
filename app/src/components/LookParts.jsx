// Rank unlocks (lib/looks.js): the shared view pieces. The accent class for a name, the live look hook, the tiles and
// their grid (My look), and the rank-reached sheet. Display only: nothing here pays NIM or grants XP.
import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Sheet, Ring } from './ui.jsx'
import { Avatar, FrameRing } from './Avatar.jsx'
import { StyleRing } from './GoalRing.jsx'
import { KINDS, getLook, isUnlocked, levelFor, LOOK_EVENT } from '../lib/looks.js'
import { LEVEL_BANNERS, isUnlocked as bannerUnlocked, bannerForRank } from '../lib/giftBanners.js'
import GiftBanner from './GiftBanner.jsx'

// accentClass lives in lib/accent.js (pure, so it is unit-tested without JSX); re-exported here so the screens keep
// importing it from LookParts as before.
export { accentClass } from '../lib/accent.js'

// The live stored look at this level (lib/looks.js getLook): re-reads on a look change (equipping in My look) and
// whenever the level changes (the caller re-renders). A locked or unknown choice already falls back to the default.
export function useLook(level = 1) {
  const [, bump] = useState(0)
  useEffect(() => {
    const on = () => bump((n) => n + 1)
    window.addEventListener(LOOK_EVENT, on)
    return () => window.removeEventListener(LOOK_EVENT, on)
  }, [])
  return getLook(level)
}

// ---- names and swatches -------------------------------------------------------------------------------------
const NAME_KEY = { coral: 'look_coral', mint: 'look_mint', butter: 'look_butter', cream: 'look_cream', citrus: 'look_citrus', gold: 'look_gold', sunset: 'look_sunset', solid: 'look_solid', steps: 'look_steps', glow: 'look_glow', dots: 'look_dots' }
// Frames reuse the rank names the app already has; 'none' is its own word.
export const lookName = (t, kind, id) => (kind === 'frame' ? (id === 'none' ? t('look_none') : t(`rank_${id}`)) : t(NAME_KEY[id] || id))

const ACC_BG = { coral: '#E8482A', mint: '#2BC48F', butter: '#FFC94D', cream: '#FFF6EC', citrus: 'linear-gradient(135deg,#FFC94D,#2BC48F)', gold: '#E9B213', sunset: 'linear-gradient(135deg,#E8482A,#FFC94D)' }
export const idForRank = (kind, rank) => (KINDS[kind].find((e) => e.rank === rank) || KINDS[kind][0]).id
// Every id a rank unlocks (a rank can now unlock two accents: Cream and Citrus at Collector), in list order.
export const idsForRank = (kind, rank) => { const ids = KINDS[kind].filter((e) => e.rank === rank).map((e) => e.id); return ids.length ? ids : [KINDS[kind][0].id] }

function Swatch({ kind, id, size = 46 }) {
  if (kind === 'accent') return <span className="lk-sw lk-sw-acc" style={{ background: ACC_BG[id] }} />
  if (kind === 'frame') {
    return (
      <span className="lk-sw lk-sw-frame avatar" style={{ width: size, height: size }}>
        <i className="avatar-ph" />{id !== 'none' && <FrameRing frame={id} shape="hex" />}
      </span>
    )
  }
  // ring
  return id === 'solid'
    ? <Ring value={0.62} size={size} stroke={7} track="#35323f" color="#E8482A" />
    : <StyleRing value={0.62} size={size} style={id} />
}

const LOCK = <svg className="lk-lock-ic" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>

function LookTile({ kind, entry, equipped, locked, t, onPick }) {
  const [shake, setShake] = useState(false)
  const click = () => {
    if (locked) { setShake(true); setTimeout(() => setShake(false), 420); return } // a short shake, no upsell
    onPick(kind, entry.id)
  }
  return (
    <button type="button" className={`lk-tile${equipped ? ' on' : ''}${locked ? ' locked' : ''}${shake ? ' shake' : ''}`}
      onClick={click} aria-pressed={equipped} aria-disabled={locked || undefined}>
      <span className="lk-sw-wrap">
        <Swatch kind={kind} id={entry.id} />
        {equipped && <span className="lk-check" aria-hidden="true">✓</span>}
      </span>
      <span className="lk-tile-name">{lookName(t, kind, entry.id)}</span>
      {locked && <span className="lk-tile-lock">{LOCK}{t('level_n', { n: levelFor(kind, entry.id) })}</span>}
    </button>
  )
}

// A card for one kind: a 3-by-2 grid of tiles (My look).
export function LookGrid({ kind, level, look, t, onPick }) {
  return (
    <section className="card lk-card">
      <h3>{t(`look_${kind}`)}</h3>
      <div className="lk-grid">
        {KINDS[kind].map((e) => (
          <LookTile key={e.id} kind={kind} entry={e} equipped={look[kind] === e.id}
            locked={!isUnlocked(kind, e.id, level)} t={t} onPick={onPick} />
        ))}
      </div>
    </section>
  )
}

// ---- the rank-reached sheet ---------------------------------------------------------------------------------
// Shown once when the user reaches a new rank (App.jsx). The avatar in the new frame, the new rank, three rows, and a
// button into My look. Nothing is equipped automatically.
export function RankSheet({ level, rank, onChoose, onClose }) {
  const { t, walletAddress } = useApp()
  const rows = [['accent', 'look_accent_sub'], ['frame', 'look_frame_sub'], ['ring', 'look_ring_sub']]
  const gb = bannerForRank(rank) // the gift banner this rank unlocks (lib/giftBanners.js), or null for starter
  return (
    <Sheet label={t(`rank_${rank}`)} onClose={onClose}>
      <div className="lk-rank-head">
        <Avatar address={walletAddress} size={80} frame={rank} />
        <span className="lk-rank-kicker">{t('look_new_rank', { n: level })}</span>
        <h3>{t(`rank_${rank}`)}</h3>
      </div>
      <ul className="lk-rank-rows">
        {rows.map(([kind, sub]) => (
          <li key={kind}>
            <span className="lk-rank-ic">{idsForRank(kind, rank).map((id) => <Swatch key={id} kind={kind} id={id} size={38} />)}</span>
            <span className="lk-rank-tx"><b>{t(`look_${kind}`)}</b><small>{t(sub)}</small></span>
          </li>
        ))}
        {gb && (
          <li className="lk-rank-gb">
            <span className="lk-rank-gb-ic"><GiftBanner banner={gb.id} thumb /></span>
            <span className="lk-rank-tx"><b>{t('gb_new', { line: t(gb.line) })}</b><small>{t('gb_list_sub')}</small></span>
          </li>
        )}
      </ul>
      <button type="button" className="btn" onClick={onChoose}>{t('look_choose')}</button>
      <p className="frd-note lk-rank-later">{t('look_later')}</p>
    </Sheet>
  )
}

// The Gift banners list (My look row): the seven level banners, each with its line, unlock level and Locked/Unlocked.
// Display only; nothing is equipped here (the banner is chosen when sending a gift, screens/Done.jsx).
export function GiftBannerSheet({ level, onClose }) {
  const { t } = useApp()
  return (
    <Sheet title={t('gb_list_title')} onClose={onClose}>
      <p className="frd-note gb-sheet-sub">{t('gb_list_sub')}</p>
      <ul className="gb-list">
        {LEVEL_BANNERS.map((b) => {
          const unlocked = bannerUnlocked(b.id, level)
          return (
            <li key={b.id} className={`gb-list-row${unlocked ? '' : ' locked'}`}>
              <span className="gb-list-art"><GiftBanner banner={b.id} thumb /></span>
              <span className="frd-row-mid"><b>{t(b.line)}</b><small>{t('gb_lv', { n: b.level })}</small></span>
              <span className={`frd-pill ${unlocked ? 'gb-pill-ok' : 'gb-pill-lock'}`}>{t(unlocked ? 'gb_unlocked' : 'gb_locked')}</span>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
