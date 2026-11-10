import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Sheet } from '../components/ui.jsx'
import { Avatar } from '../components/Avatar.jsx'
import { Medal } from '../components/Badge.jsx'
import { listGoals } from '../lib/goals.js'
import { profileStats } from '../lib/profileStats.js'
import { stakeSummary } from '../lib/earned.js'
import { readStaker } from '../lib/nimiq.js'
import { getName } from '../lib/name.js'
import { fmtDate, fmtEarned, fmtNim, fmtUsd } from '../lib/format.js'
import { poolName } from '../lib/pace.js'
import { BADGES, GROUPS, getBadges } from '../lib/badges.js'
import { CLAIM_EMAIL, PROGRAM_END, REWARDS, REWARD_IDS, active as rewardsActive, claimDetails, state as rewardState } from '../lib/rewards.js'
import { itemLabel } from '../lib/itemName.js'
import { copyText } from '../lib/clipboard.js'

const TOTAL = BADGES.length
const longDate = (d, lang) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)).replace(/ /g, ' ')
// Short date for the stats row ("Nov 3", "3 nov."), with the year when it is not this year.
const shortDate = (d, lang) => {
  const date = new Date(d)
  const opts = { day: 'numeric', month: 'short', ...(date.getFullYear() !== new Date().getFullYear() ? { year: '2-digit' } : {}) }
  return new Intl.DateTimeFormat(lang, opts).format(date).replace(/ /g, ' ')
}
const endDate = (lang) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(PROGRAM_END))

// The recorded badges (dibs.badges), re-read whenever a badge check records a new one.
function useBadges() {
  const [badges, setBadges] = useState(getBadges)
  useEffect(() => {
    const on = () => setBadges(getBadges())
    window.addEventListener('dibs:badges', on)
    return () => window.removeEventListener('dibs:badges', on)
  }, [])
  return badges
}

// Profile: the name, one compact stats card, the badges and the Rewards card, all from data the app already has
// (goal ledger, staker, dibs.name, dibs.badges). badge/badgeAt: open that badge's sheet (from the stamp).
export default function Profile({ badge: askedBadge, badgeAt }) {
  const { t, lang, address, walletAddress, prices, reset } = useApp()
  const name = getName() // changed only in More > Settings
  // Earned from staking: the Stake tab's own figure. undefined while reading, null when the chain is unreadable.
  const [earned, setEarned] = useState(undefined)
  useEffect(() => {
    let live = true
    readStaker(address).then((st) => { if (live) setEarned(stakeSummary(st, address).earned) }).catch(() => { if (live) setEarned(null) })
    return () => { live = false }
  }, [address])
  const badges = useBadges()
  const [expanded, setExpanded] = useState(false)
  const [sheet, setSheet] = useState(null) // badge id
  useEffect(() => { if (askedBadge && BADGES.some((b) => b.id === askedBadge)) setSheet(askedBadge) }, [askedBadge, badgeAt])

  const goals = listGoals(address)
  const s = profileStats(goals)
  const empty = s.totalSaved === 0 && s.activeGoals === 0 && s.cardsBought === 0
  // Same USD format as everywhere (format.js). Hidden while prices load and when nothing is saved.
  const usd = prices && s.totalSaved > 0 ? fmtUsd(s.totalSaved * prices.nimUsd, lang) : null
  // The pill next to the total: what staking earned, or where the NIM is staked while nothing is earned yet.
  // None while the chain is being read or cannot be read, and none when nothing is saved.
  const pill = s.totalSaved > 0 && earned != null
    ? (earned > 0 ? t('prof_earned_pill', { amount: fmtEarned(earned, lang) }) : t('prof_earning', { pool: poolName() }))
    : null

  const stats = [
    { tone: 'coral', label: t('prof_active_s'), value: s.activeGoals },
    { tone: 'mint', label: t('prof_done_s'), value: s.goalsDone },
    { tone: 'butter', label: t('prof_cards_s'), value: s.cardsBought },
    { tone: 'cream', label: t('prof_since_s'), value: s.savingSince ? shortDate(s.savingSince, lang) : '-' },
  ]
  const earnedList = BADGES.filter((b) => badges[b.id])
  const showRewards = rewardsActive()

  return (
    <>
      <Header />
      <main className="screen">
        <section className="prof-head">
          <h2 className="title">{t('tab_profile')}</h2>
          <div className="prof-who">
            <Avatar address={walletAddress} size={56} className="prof-av"
              fallback={name ? <span className="prof-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span> : null} />
            {name && <span className="prof-name">{name}</span>}
          </div>
          <p className="sub">{t('prof_intro')}</p>
        </section>

        <section className="pstats">
          <div className="pstats-top">
            <div className="pstats-total">
              <span className="pstats-label">{t('prof_saved')}</span>
              <b>{fmtNim(s.totalSaved, lang)}<small> NIM</small></b>
              {usd && <span className="pstats-usd">{t('prof_usd', { usd })}</span>}
            </div>
            {pill && <span className="prof-pill"><i aria-hidden="true" />{pill}</span>}
          </div>
          <div className="pstats-row">
            {stats.map((x) => (
              <div className={`pstat ${x.tone}`} key={x.tone}><b>{x.value}</b><span>{x.label}</span></div>
            ))}
          </div>
        </section>

        {empty && (
          <section className="prof-empty">
            <p>{t('prof_empty')}</p>
            <button type="button" className="btn" onClick={() => reset('home')}>{t('prof_empty_cta')}</button>
          </section>
        )}

        <section className="badges">
          <div className="sec-head">
            <h3>{t('badges_title')}</h3>
            {expanded
              ? <button type="button" className="txt-link" onClick={() => setExpanded(false)}>{t('badges_less')}</button>
              : <span className="small">{t('badges_count', { n: earnedList.length, total: TOTAL })}</span>}
          </div>
          {!expanded && (earnedList.length
            ? <div className="bgrid">{earnedList.map((b) => <BadgeCell key={b.id} id={b.id} earned onOpen={setSheet} />)}</div>
            : <p className="small">{t('badges_none')}</p>)}
          {expanded && GROUPS.map((g) => (
            <div className="bgroup" key={g}>
              <h4>{t(`badge_g_${g}`)}</h4>
              <div className="bgrid">{BADGES.filter((b) => b.group === g).map((b) => <BadgeCell key={b.id} id={b.id} earned={Boolean(badges[b.id])} onOpen={setSheet} />)}</div>
            </div>
          ))}
          {!expanded && <button type="button" className="btn ghost bsee" onClick={() => setExpanded(true)}>{t('badges_all', { total: TOTAL })} ›</button>}
        </section>

        {showRewards && <RewardsCard badges={badges} goals={goals} onOpen={setSheet} />}
      </main>
      {sheet && <BadgeSheet id={sheet} badges={badges} goals={goals} onClose={() => setSheet(null)} />}
    </>
  )
}

function BadgeCell({ id, earned, onOpen }) {
  const { t } = useApp()
  return (
    <button type="button" className={`bcell${earned ? '' : ' locked'}`} onClick={() => onOpen(id)}>
      <Medal id={id} earned={earned} size={58} />
      <span>{t(`badge_${id}`)}</span>
    </button>
  )
}

function RewardsCard({ badges, goals, onOpen }) {
  const { t, lang, go } = useApp()
  return (
    <section className="rw-card">
      <div className="rw-head"><h3>{t('rw_title')}</h3><span>{t('rw_until', { date: endDate(lang) })}</span></div>
      {REWARD_IDS.map((id) => {
        const st = rewardState(id, { badges, goals })
        const label = st.state === 'claim' ? t('rw_state_claim') : st.state === 'wait' ? t('rw_state_wait', { date: fmtDate(st.date, lang) }) : t('rw_state_not')
        return (
          <button type="button" className="rw-row" key={id} onClick={() => onOpen(id)}>
            <Medal id={id} earned={Boolean(badges[id])} size={40} />
            <span className="rw-mid">
              <b>{t(`badge_${id}`)} · <em>{t('rw_amount', { amount: fmtNim(REWARDS[id].nim, lang) })}</em></b>
              <small>{t(`rw_${id}_how`)}</small>
            </span>
            <span className={`rw-state ${st.state}`}>{label}</span>
          </button>
        )
      })}
      <p className="rw-note">{t('rw_note')} <button type="button" className="txt-link" onClick={() => go('legal', { page: 'rewards' })}>{t('rw_rules')}</button></p>
    </section>
  )
}

function BadgeSheet({ id, badges, goals, onClose }) {
  const { t, lang, shareBadge } = useApp()
  const [claim, setClaim] = useState(false)
  const b = BADGES.find((x) => x.id === id)
  const rec = badges[id]
  const earned = Boolean(rec)
  const name = t(`badge_${id}`)
  const reward = REWARDS[id] && rewardsActive() ? REWARDS[id] : null
  const amount = reward ? fmtNim(reward.nim, lang) : ''
  const st = reward ? rewardState(id, { badges, goals }) : null
  const goal = rec?.goalId ? goals.find((g) => g.id === rec.goalId) : null
  const next = BADGES.find((x) => x.group === b.group && !badges[x.id])

  if (claim) return <ClaimSheet id={id} amount={amount} goals={goals} onClose={() => setClaim(false)} />

  const shareBtn = (cls) => <button type="button" className={cls} onClick={() => shareBadge(id)}>{t('badge_share')}</button>
  const hint = <p className="small">{t('share_hint')}</p>
  const closeBtn = <button type="button" className="btn ghost" onClick={onClose}>{t('ob_close')}</button>
  return (
    <Sheet label={name} onClose={onClose}>
      <div className="bsheet-head">
        <Medal id={id} earned={earned} size={104} />
        <h3>{name}</h3>
        <p>{t(`badge_${id}_how`)}</p>
        {!earned && <span className="bsheet-locked">{t('badge_locked')}</span>}
      </div>
      {(earned || reward) && (
        <dl className="facts">
          {earned && <div><dt>{t('badge_earned_on')}</dt><dd>{longDate(rec.at, lang)}</dd></div>}
          {earned && goal && <div><dt>{t('badge_with')}</dt><dd>{itemLabel(t, goal)}</dd></div>}
          {earned && next && <div><dt>{t('badge_next')}</dt><dd>{t(`badge_${next.id}`)}</dd></div>}
          {reward && <div className="rw"><dt>{t('rw_row')}</dt><dd>{t('rw_row_value', { amount })}</dd></div>}
        </dl>
      )}
      {earned && reward ? (
        <>
          <button type="button" className="btn" disabled={st.state === 'wait'} onClick={() => setClaim(true)}>
            {st.state === 'wait' ? t('rw_state_wait', { date: fmtDate(st.date, lang) }) : t('rw_claim_btn')}
          </button>
          <div className="bsheet-pair">{shareBtn('btn ghost')}{closeBtn}</div>
          {hint}
        </>
      ) : earned ? (
        <>{shareBtn('btn')}{hint}{closeBtn}</>
      ) : closeBtn}
    </Sheet>
  )
}

function ClaimSheet({ id, amount, goals, onClose }) {
  const { t, go, toast, walletAddress } = useApp()
  const lines = claimDetails(id, { goals, walletAddress, t })
  const copy = async () => { if (await copyText(lines.join('\n'))) toast(t('rw_copied')) }
  return (
    <Sheet title={t('rw_claim_title', { amount })} onClose={onClose}>
      <ol className="rw-steps">
        <li>{t('rw_step1', { badge: t(`badge_${id}`) })}</li>
        <li>{t('rw_step2', { email: CLAIM_EMAIL })}</li>
        <li>{t(`rw_step3_${id}`)}</li>
      </ol>
      <pre className="rw-box">{lines.join('\n')}</pre>
      <button type="button" className="btn" onClick={copy}>{t('rw_copy')}</button>
      <p className="small">{t('rw_address_note')} <button type="button" className="txt-link" onClick={() => go('legal', { page: 'rewards' })}>{t('rw_rules')}</button></p>
    </Sheet>
  )
}
