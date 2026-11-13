import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Icon, Sheet, useFiat } from '../components/ui.jsx'
import QuestCard from '../components/QuestCard.jsx'
import { Avatar } from '../components/Avatar.jsx'
import { HEX, Medal } from '../components/Badge.jsx'
import { listGoals } from '../lib/goals.js'
import { profileStats } from '../lib/profileStats.js'
import { getName } from '../lib/name.js'
import { fmtDate, fmtNim } from '../lib/format.js'
import { fmtFiatValue } from '../lib/fiatValue.js'
import { BADGES, GROUPS, getBadges } from '../lib/badges.js'
import { CLAIM_EMAIL, PROGRAM_END, REWARDS, REWARD_IDS, active as rewardsActive, claimDetails, state as rewardState } from '../lib/rewards.js'
import { itemLabel } from '../lib/itemName.js'
import { copyText } from '../lib/clipboard.js'
import { STREAK_BARS, claimable, streakView } from './profileView.js'
import { RANKS, XP } from '../lib/xp.js'
import { useXp } from '../lib/useXp.js'
import { levelToPlay, markBadges, newBadges, setLevelSeen } from '../lib/seen.js'

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

// Profile: the name, a banner per reward ready to claim, one compact stats card, the level, the badges and the Rewards
// card, all from data the app already has (goal ledger, dibs.name, dibs.badges). badge/badgeAt: open that badge's sheet.
// section 'quests' (Home's Quests strip, with sectionAt): scroll to the Quests section.
export default function Profile({ badge: askedBadge, badgeAt, section, sectionAt }) {
  const { t, lang, address, walletAddress, reset } = useApp()
  const name = getName() // changed only in More > Settings
  const fiat = useFiat()
  const badges = useBadges()
  const [expanded, setExpanded] = useState(false)
  const [sheet, setSheet] = useState(null) // badge id
  useEffect(() => { if (askedBadge && BADGES.some((b) => b.id === askedBadge)) setSheet(askedBadge) }, [askedBadge, badgeAt])
  useEffect(() => {
    if (section !== 'quests') return undefined
    const id = requestAnimationFrame(() => document.getElementById('quests')?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(id)
  }, [section, sectionAt])

  const goals = listGoals(address)
  const s = profileStats(goals)
  const empty = s.totalSaved === 0 && s.activeGoals === 0 && s.cardsBought === 0
  // The total in the Currency choice, same path and format as the header pill (useFiat): hidden without a live rate
  // and when nothing is saved.
  const value = s.totalSaved > 0 ? fmtFiatValue(s.totalSaved, fiat, lang) : null

  const stats = [
    { tone: 'coral', label: t('prof_active_s'), value: s.activeGoals },
    { tone: 'mint', label: t('prof_done_s'), value: s.goalsDone },
    { tone: 'butter', label: t('prof_cards_s'), value: s.cardsBought },
    { tone: 'cream', label: t('prof_since_s'), value: s.savingSince ? shortDate(s.savingSince, lang) : '-' },
  ]
  const earnedList = BADGES.filter((b) => badges[b.id])
  // New badges pop once (lib/seen.js dibs.seen.badges): 120 ms apart, at most 6 animated, the rest just appear.
  const earnedKey = earnedList.map((b) => b.id).join()
  const [fresh, setFresh] = useState(() => newBadges(earnedList.map((b) => b.id)).slice(0, MAX_POPS))
  useEffect(() => {
    const ids = earnedList.map((b) => b.id)
    const n = newBadges(ids)
    if (!n.length) return
    setFresh((f) => [...f, ...n.filter((id) => !f.includes(id))].slice(0, MAX_POPS))
    markBadges(n)
  }, [earnedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const popOf = (id) => { const i = fresh.indexOf(id); return i < 0 ? null : i }
  const showRewards = rewardsActive()
  const toClaim = claimable({ badges, goals })
  const xp = useXp(address)
  const [xpSheet, setXpSheet] = useState(null) // 'ranks' | 'xp'

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
        </section>

        {toClaim.map((id) => (
          <button type="button" className="claim-banner" key={id} onClick={() => setSheet(id)}>
            <Medal id={id} earned size={40} />
            <span className="cb-text">
              <b>{t('rw_banner', { amount: fmtNim(REWARDS[id].nim, lang) })}</b>
              <small>{t('rw_banner_sub', { badge: t(`badge_${id}`) })}</small>
            </span>
            <span className="cb-pill">{t('rw_claim_pill')}</span>
          </button>
        ))}

        <section className="pstats">
          <div className="pstats-top">
            <div className="pstats-total">
              <span className="pstats-label">{t('prof_saved_all')}</span>
              <b>{fmtNim(s.totalSaved, lang)}<small> NIM</small></b>
              {value && <span className="pstats-usd">{value}</span>}
            </div>
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

        <LevelCard x={xp} onRanks={() => setXpSheet('ranks')} onHow={() => setXpSheet('xp')} />

        <QuestCard title={t('quests_title')} id="quests" />

        <section className="badges">
          <div className="sec-head">
            <h3>{t('badges_title')}</h3>
            {expanded
              ? <button type="button" className="txt-link" onClick={() => setExpanded(false)}>{t('badges_less')}</button>
              : <span className="small">{t('badges_count', { n: earnedList.length, total: TOTAL })}</span>}
          </div>
          {!expanded && (earnedList.length
            ? <div className="bgrid">{earnedList.map((b) => <BadgeCell key={b.id} id={b.id} earned pop={popOf(b.id)} onOpen={setSheet} />)}</div>
            : <p className="small">{t('badges_none')}</p>)}
          {expanded && GROUPS.map((g) => (
            <div className="bgroup" key={g}>
              <h4>{t(`badge_g_${g}`)}</h4>
              <div className="bgrid">{BADGES.filter((b) => b.group === g).map((b) => <BadgeCell key={b.id} id={b.id} earned={Boolean(badges[b.id])} pop={popOf(b.id)} onOpen={setSheet} />)}</div>
            </div>
          ))}
          {!expanded && <button type="button" className="btn ghost bsee" onClick={() => setExpanded(true)}>{t('badges_all', { total: TOTAL })} ›</button>}
        </section>

        {showRewards && <RewardsCard badges={badges} goals={goals} onOpen={setSheet} />}
      </main>
      {xpSheet === 'ranks' && <RanksSheet x={xp} onHow={() => setXpSheet('xp')} onClose={() => setXpSheet(null)} />}
      {xpSheet === 'xp' && <XpSheet x={xp} onClose={() => setXpSheet(null)} />}
      {sheet && <BadgeSheet id={sheet} badges={badges} goals={goals} onClose={() => setSheet(null)} />}
    </>
  )
}

const MAX_POPS = 6
// pop: its place among the new badges (pops 120 ms after the one before), or null.
function BadgeCell({ id, earned, pop = null, onOpen }) {
  const { t } = useApp()
  return (
    <button type="button" className={`bcell${earned ? '' : ' locked'}${pop != null ? ' bnew' : ''}`} style={pop != null ? { '--d': `${pop * 120}ms` } : undefined} onClick={() => onOpen(id)}>
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
        const label = st.state === 'claim' ? null : st.state === 'wait' ? t('rw_state_wait', { date: fmtDate(st.date, lang) }) : t('rw_state_not')
        return (
          <button type="button" className="rw-row" key={id} onClick={() => onOpen(id)}>
            <Medal id={id} earned={Boolean(badges[id])} size={40} />
            <span className="rw-mid">
              <b>{t(`badge_${id}`)}{'\u00a0'}<span className="rw-amt">· <em>{t('rw_amount', { amount: fmtNim(REWARDS[id].nim, lang) })}</em></span></b>
              <small>{t(`rw_${id}_how`)}</small>
            </span>
            {st.state === 'claim'
              ? <span className="rw-claim">{t('rw_claim_pill')}</span>
              : <span className={`rw-state ${st.state}`}>{label}</span>}
          </button>
        )
      })}
      <p className="rw-note">{t('rw_note')}</p>
      <button type="button" className="lvl-how rw-how" onClick={() => go('legal', { page: 'rewards' })}>
        <span className="rw-how-ic" aria-hidden="true"><Icon name="info" size={18} /></span>
        <span className="rw-how-txt">{t('rw_claim_btn')}</span>
        <span className="chev" aria-hidden="true">›</span>
      </button>
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
      <dl className="facts">
        {earned && <div><dt>{t('badge_earned_on')}</dt><dd>{longDate(rec.at, lang)}</dd></div>}
        {earned && goal && <div><dt>{t('badge_with')}</dt><dd>{itemLabel(t, goal)}</dd></div>}
        <div><dt>{t('badge_reward')}</dt><dd>{t('badge_reward_xp')}</dd></div>
        {earned && next && <div><dt>{t('badge_next')}</dt><dd>{t(`badge_${next.id}`)}</dd></div>}
        {reward && <div className="rw"><dt>{t('rw_row')}</dt><dd>{t('rw_row_value', { amount })}</dd></div>}
      </dl>
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

// Level up on the Level card, once per level (lib/seen.js dibs.seen.level): the bar fills to 100 % (400 ms), the hexagon
// flips to the new number (400 ms, 12 % scale bump), the bar empties and fills to the new progress (500 ms), the XP
// text counting along. A level reached while Profile was closed plays the next time it opens. Reduced motion: the
// final state at once. Returns the view to draw, or null for the live figures.
const needOf = (level) => 100 + 50 * (level - 1)
const reducedMotion = () => { try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) } catch { return false } }
function levelPlan(x) {
  const p = levelToPlay(x.level, x.into)
  if (!p) return null
  if (reducedMotion()) { setLevelSeen(x.level, x.into); return null }
  return { from: p.from, fromInto: Math.min(p.into, needOf(p.from)), to: x.level }
}
// The card as it was before the level up: the old level and its XP.
const startView = (plan) => ({ level: plan.from, need: needOf(plan.from), into: plan.fromInto, pct: Math.round((plan.fromInto / needOf(plan.from)) * 100), barMs: 0, flip: false })
function useLevelUp(x) {
  const [plan, setPlan] = useState(() => levelPlan(x))
  const [view, setView] = useState(null)
  const xRef = useRef(x)
  xRef.current = x
  // No level up to play: keep the stored figures current. A level reached while Profile is open plays at once.
  useEffect(() => {
    if (plan) return
    const p = levelPlan(x)
    if (p) setPlan(p)
    else setLevelSeen(x.level, x.into)
  }, [x.level, x.into, plan]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!plan) { setView(null); return undefined }
    const oldNeed = needOf(plan.from)
    const timers = []
    const raf = { id: 0 }
    const at = (ms, fn) => timers.push(setTimeout(fn, ms))
    const count = (from, to, ms) => {
      const start = performance.now()
      const tick = (now) => {
        const k = Math.min(1, (now - start) / ms)
        const e = 1 - Math.pow(1 - k, 3)
        setView((v) => v && { ...v, into: from + (to - from) * e })
        if (k < 1) raf.id = requestAnimationFrame(tick)
      }
      cancelAnimationFrame(raf.id)
      raf.id = requestAnimationFrame(tick)
    }
    setView(startView(plan))
    at(350, () => { setView((v) => ({ ...v, pct: 100, barMs: 400 })); count(plan.fromInto, oldNeed, 400) })
    at(750, () => setView((v) => ({ ...v, flip: true })))
    at(950, () => setView((v) => ({ ...v, level: plan.to })))
    at(1150, () => {
      const live = xRef.current
      setView((v) => ({ ...v, flip: false, pct: 0, barMs: 0, into: 0, need: live.need }))
    })
    at(1190, () => {
      const live = xRef.current
      setView((v) => ({ ...v, pct: live.need ? Math.min(100, Math.round((live.into / live.need) * 100)) : 0, barMs: 500 }))
      count(0, live.into, 500)
    })
    at(1750, () => { const live = xRef.current; setLevelSeen(Math.max(plan.to, live.level), live.into); setPlan(null) })
    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf.id) }
  }, [plan])
  return plan ? view || startView(plan) : null
}

// Level card: the level in a coral hexagon, the rank, the XP bar and the next rank. Opens the Ranks sheet.
function LevelCard({ x, onRanks, onHow }) {
  const { t } = useApp()
  const v = useLevelUp(x)
  const level = v ? v.level : x.level
  const into = v ? Math.round(v.into) : x.into
  const need = v ? v.need : x.need
  const pct = v ? v.pct : x.need ? Math.min(100, Math.round((x.into / x.need) * 100)) : 0
  return (
    <section className="lvl">
      <div className="lvl-card">
        <button type="button" className="lvl-main" onClick={onRanks}>
          <span className="lvl-top">
            <span className={`lvl-hex${v?.flip ? ' flip' : ''}`} aria-hidden="true">
              <svg viewBox="-1 -1 29 26"><path d={HEX} fill="#E8482A" /></svg>
              <b>{level}</b>
            </span>
            <span className="lvl-mid">
              <small>{t('level_rank_small', { n: level })}</small>
              <b>{t(`rank_${x.rank.id}`)}</b>
            </span>
            <span className="chev" aria-hidden="true">›</span>
          </span>
          <span className="lvl-bar" aria-hidden="true"><i style={{ width: `${pct}%`, ...(v ? { transition: v.barMs ? `width ${v.barMs}ms ease-out` : 'none' } : null) }} /></span>
          <span className="lvl-foot">
            <span>{t('xp_of', { into, need })}</span>
            <span>{x.next ? t('xp_next_rank', { rank: t(`rank_${x.next.id}`), level: x.next.level }) : t('xp_top_rank')}</span>
          </span>
        </button>
        <StreakRow rhythm={x.rhythm} />
        <button type="button" className="lvl-how" onClick={onHow}>
          <span>{t('xp_how')}</span>
          <span className="chev" aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  )
}

// Weekly streak, between the XP line and How to earn XP: five bars lit to the rhythm level (aria-hidden, the text
// carries the meaning), then the weeks in a row and the XP bonus. Display only.
function StreakRow({ rhythm }) {
  const { t } = useApp()
  const s = streakView(rhythm, t)
  return (
    <div className="lvl-streak">
      <span className="lvl-bars" aria-hidden="true">
        {Array.from({ length: STREAK_BARS }, (_, i) => <i key={i} className={i < s.lit ? 'on' : undefined} />)}
      </span>
      <span className={`lvl-streak-txt${s.none ? ' none' : ''}`}>
        {s.none ? s.text : <><b>{s.text}</b>{s.bonus && <span> · {s.bonus}</span>}</>}
      </span>
    </div>
  )
}

function RanksSheet({ x, onHow, onClose }) {
  const { t } = useApp()
  return (
    <Sheet title={t('ranks_title')} onClose={onClose}>
      <ul className="ranks-list">
        {RANKS.map((r) => {
          const you = r.id === x.rank.id
          const name = t(`rank_${r.id}`)
          return (
            <li key={r.id} className={you ? 'you' : undefined}>
              <span>{you ? t('rank_you', { rank: name }) : name}</span>
              <b>{t('level_n', { n: r.level })}</b>
            </li>
          )
        })}
      </ul>
      <h4 className="ranks-h">{t('rhythm_title')}</h4>
      <p className="ranks-p">{t('rhythm_body')}</p>
      <p className="ranks-now">{x.rhythm.level > 0 ? t('rhythm_now', { weeks: x.rhythm.weeks, pct: x.rhythm.level * 10 }) : t('rhythm_none')}</p>
      <button type="button" className="btn ghost" onClick={onHow}>{t('xp_how')}</button>
      <button type="button" className="btn ghost" onClick={onClose}>{t('ob_close')}</button>
    </Sheet>
  )
}

const XP_ROWS = [['xp_r_open', XP.open], ['xp_r_add', XP.deposit, 'xp_r_add_note'], ['xp_r_1000', XP.thousand], ['xp_r_milestone', XP.milestone],
  ['xp_r_quest', XP.quest], ['xp_r_badge', XP.badge], ['xp_r_share', XP.share], ['xp_r_card', XP.card]]

function XpSheet({ x, onClose }) {
  const { t } = useApp()
  const list = RANKS.map((r) => `${t(`rank_${r.id}`)} ${r.level}`).join(' · ')
  return (
    <Sheet title={t('xp_how')} onClose={onClose}>
      <p className="ranks-p">{t('xp_sheet_lead', { n: x.level, rank: t(`rank_${x.rank.id}`) })}</p>
      <dl className="facts">
        {XP_ROWS.map(([key, n, note]) => (
          <div key={key}>
            <dt className="xp-dt">{t(key)}{note && <small> {t(note)}</small>}</dt>
            <dd><span className="xp-pill">{t('xp_plus', { n })}</span></dd>
          </div>
        ))}
      </dl>
      <p className="small">{t('ranks_line', { list })}</p>
      <button type="button" className="btn ghost" onClick={onClose}>{t('ob_close')}</button>
    </Sheet>
  )
}
