// Rank unlocks (lib/looks.js): the shared view pieces. The accent class for a name, the live look hook, the tiles and
// their grid (My look), and the rank-reached sheet. Display only: nothing here pays NIM or grants XP.
import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Sheet, Ring } from './ui.jsx'
import { Avatar, FrameRing } from './Avatar.jsx'
import { StyleRing } from './GoalRing.jsx'
import { KINDS, getLook, isUnlocked, levelFor, LOOK_EVENT } from '../lib/looks.js'

// The class that colours a name in its accent. Coral (default) adds nothing, so the name keeps its normal colour and
// the default look is pixel-identical. An unknown id adds nothing too.
export const accentClass = (id) => (id && id !== 'coral' && ['mint', 'butter', 'cream', 'gold', 'sunset'].includes(id) ? `lk-acc lk-acc-${id}` : '')

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
const NAME_KEY = { coral: 'look_coral', mint: 'look_mint', butter: 'look_butter', cream: 'look_cream', gold: 'look_gold', sunset: 'look_sunset', solid: 'look_solid', steps: 'look_steps', glow: 'look_glow', dots: 'look_dots' }
// Frames reuse the rank names the app already has; 'none' is its own word.
export const lookName = (t, kind, id) => (kind === 'frame' ? (id === 'none' ? t('look_none') : t(`rank_${id}`)) : t(NAME_KEY[id] || id))

const ACC_BG = { coral: '#E8482A', mint: '#2BC48F', butter: '#FFC94D', cream: '#FFF6EC', gold: '#E9B213', sunset: 'linear-gradient(135deg,#E8482A,#FFC94D)' }
export const idForRank = (kind, rank) => (KINDS[kind].find((e) => e.rank === rank) || KINDS[kind][0]).id

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
            <span className="lk-rank-ic"><Swatch kind={kind} id={idForRank(kind, rank)} size={38} /></span>
            <span className="lk-rank-tx"><b>{t(`look_${kind}`)}</b><small>{t(sub)}</small></span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={onChoose}>{t('look_choose')}</button>
      <p className="frd-note lk-rank-later">{t('look_later')}</p>
    </Sheet>
  )
}
