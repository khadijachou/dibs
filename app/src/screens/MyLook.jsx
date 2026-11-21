// My look (route myLook, back to Profile): a preview at the top, then three cards of tiles (Accent, Avatar frame, Goal
// ring). A tap equips at once and saves (lib/looks.js). Looks only: no XP, nothing else changes.
import { useApp } from '../App.jsx'
import { Header, Ring } from '../components/ui.jsx'
import { Avatar } from '../components/Avatar.jsx'
import { StyleRing } from '../components/GoalRing.jsx'
import { LookGrid, accentClass, useLook } from '../components/LookParts.jsx'
import { useXp } from '../lib/useXp.js'
import { getName } from '../lib/name.js'
import { setLook, resetLook, isDefaultLook, accentChoice } from '../lib/looks.js'
import { syncLookQuiet } from '../lib/friends.js'

export default function MyLook() {
  const { t, address, walletAddress, back } = useApp()
  const { level, rank } = useXp(address)
  const look = useLook(level)
  const name = getName()
  // Equip and save at once; if Friends is on and the accent or frame is shared (R1), send the change too.
  const pick = (kind, id) => { setLook(kind, id, level); if (kind !== 'ring') syncLookQuiet(address) }

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <h2 className="title">{t('look_title')}</h2>

        <section className="card lk-preview">
          <Avatar address={walletAddress} size={64} className="lk-preview-av" frame={look.frame}
            fallback={name ? <span className="prof-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span> : null} />
          <div className="lk-preview-txt">
            {name && <span className={`lk-preview-name ${accentClass(accentChoice(level))}`}>{name}</span>}
            <span className="lk-preview-sub">{t('frd_level_rank', { n: level, rank: t(`rank_${rank.id}`) })}</span>
          </div>
          <span className="lk-preview-ring" aria-hidden="true">
            {look.ring === 'solid'
              ? <Ring value={0.62} size={56} stroke={8} track="#35323f" color="#E8482A" />
              : <StyleRing value={0.62} size={56} style={look.ring} />}
          </span>
        </section>

        {/* Accent: tick the tile the user actually chose (accentChoice), so nothing is ticked until one is picked. */}
        <LookGrid kind="accent" level={level} look={{ ...look, accent: accentChoice(level) }} t={t} onPick={pick} />
        <LookGrid kind="frame" level={level} look={look} t={t} onPick={pick} />
        <LookGrid kind="ring" level={level} look={look} t={t} onPick={pick} />

        {!isDefaultLook(level) && <button type="button" className="btn ghost lk-reset" onClick={() => { resetLook(); syncLookQuiet(address) }}>{t('look_reset')}</button>}
        <p className="frd-note lk-only-note">{t('look_only')}</p>
      </main>
    </>
  )
}
