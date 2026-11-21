// Two profiles in one screen: me:true is My profile (name, who-sees-what switches, see-as-friend, delete);
// an id is a friend's profile (only the cards the server returned, plus what they keep private, and Remove friend).
import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Sheet, BrandLogo } from '../components/ui.jsx'
import { Avatar, FriendAvatar } from '../components/Avatar.jsx'
import { Medal } from '../components/Badge.jsx'
import { badgeById } from '../lib/badges.js'
import { NAME_MAX } from '../lib/name.js'
import { fmtNim } from '../lib/format.js'
import { useXp } from '../lib/useXp.js'
import BrandSheet from '../components/BrandSheet.jsx'
import {
  ThreeWay, ConfirmSheet, AmountConsentSheet, PrivateLine, Skeleton, FriendNotice, brandByKey, WishPill,
} from '../components/FriendsParts.jsx'
import { getState, getVis, patchMe, syncQuiet, turnOff, loadProfile, loadAsFriend, removeFriend } from '../lib/friends.js'
import { useLook, accentClass } from '../components/LookParts.jsx'
import { accentChoice } from '../lib/looks.js'
import { giftGoalIds, giftOf, setThanked } from '../lib/gifts.js'
import { listGoals } from '../lib/goals.js'

const fmtSince = (iso, lang) => { try { return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) } catch { return '' } }

// The still-existing gift goal I created for this friend and brand, if any (so a "You called dibs" row can open it).
function findGiftGoal(address, friendId, brandKey) {
  const ids = new Set(listGoals(address).map((g) => g.id))
  for (const id of giftGoalIds()) {
    const tag = giftOf(id)
    if (tag && tag.friendId === friendId && tag.brandKey === brandKey && ids.has(id)) return id
  }
  return null
}

// The cards a friend profile shows, in order: Saved and earned, Active goals, Badges, Cards bought, Wishlist.
// Only the items present in the response. Unknown brand keys are skipped. Amounts are in the viewer's language, NIM only.
// friend = { id, name } when this is a real friend's profile: then each wish row gets a gift pill from profile.wishes.
// The "see it as a friend" preview and my own Wishlist pass no friend, so they never show a pill.
function ProfileCards({ profile, friend = null }) {
  const { t, lang, go, address } = useApp()
  const [giftBrand, setGiftBrand] = useState(null) // the brand whose BrandSheet is open for a new gift
  const totals = profile.totals && Number.isFinite(profile.totals.saved) ? profile.totals : null
  const badges = (profile.badges || []).filter((id) => badgeById(id))
  const wishlist = (profile.wishlist || []).map(brandByKey).filter(Boolean)
  const cards = (profile.cards || []).map((c) => ({ b: brandByKey(c?.brandKey), value: c?.value })).filter((c) => c.b)
  const goals = (profile.goals || []).filter((g) => brandByKey(g.brandKey))
  const hasEarned = totals && Number.isFinite(totals.earned)
  const wishes = (friend && profile.wishes) || {}
  // Call dibs: pick a version and value on the brand sheet, then open Plan as a gift (nothing is sent to the server yet).
  const pickGift = (region, itemId) => { const brandKey = giftBrand.key; setGiftBrand(null); go('plan', { brandKey, region, itemId, giftFor: { id: friend.id, name: profile.name } }) }
  return (
    <>
      {totals && (
        <section className="card frd-card">
          <div className="sec-head"><h3>{t('frd_item_totals')} <span className="frd-muted-ttl">{t('frd_in_dibs')}</span></h3></div>
          <div className={`frd-totals${hasEarned ? '' : ' one'}`}>
            <div className="frd-total-tile"><b>{fmtNim(totals.saved, lang)}</b><span>{t('frd_saved_label')}</span></div>
            {hasEarned && <div className="frd-total-tile earned"><b>+{fmtNim(totals.earned, lang)}</b><span>{t('frd_earned_label')}</span></div>}
          </div>
        </section>
      )}
      {goals.length > 0 && (
        <section className="card frd-card">
          <div className="sec-head"><h3>{t('frd_item_goals')} · {goals.length}</h3></div>
          {goals.map((g, i) => {
            const b = brandByKey(g.brandKey)
            return (
              <div className="frd-goal-row" key={g.brandKey + i}>
                <BrandLogo brand={b} className="frd-brand-logo" />
                <span className="frd-row-mid"><b>{g.value ? `${b.name} · ${g.value}` : b.name}</b><span className="frd-goalbar" aria-hidden="true"><i style={{ width: `${g.pct}%` }} /></span></span>
                <span className="frd-pct">{g.pct}%</span>
              </div>
            )
          })}
        </section>
      )}
      {badges.length > 0 && (
        <section className="card frd-card">
          <div className="sec-head"><h3>{t('frd_item_badges')} · {badges.length}</h3></div>
          <div className="frd-badge-grid">{badges.map((id) => (
            <span key={id} className="frd-badge"><Medal id={id} earned size={48} /><small>{t(`badge_${id}`)}</small></span>
          ))}</div>
        </section>
      )}
      {cards.length > 0 && (
        <section className="card frd-card">
          <div className="sec-head"><h3>{t('frd_item_cards')} · {cards.length}</h3></div>
          <div className="frd-card-chips">{cards.map((c, i) => (
            <span className="frd-card-chip" key={c.b.key + i}><BrandLogo brand={c.b} className="frd-chip-logo" /><span>{c.value ? `${c.b.name} ${c.value}` : c.b.name}</span></span>
          ))}</div>
        </section>
      )}
      {wishlist.length > 0 && (
        <section className="card frd-card">
          <div className="sec-head"><h3>{t('frd_item_wishlist')} · {wishlist.length}</h3></div>
          {wishlist.map((b) => {
            const w = wishes[b.key]
            const status = w?.status
            const mineGoalId = friend && status === 'mine' ? findGiftGoal(address, friend.id, b.key) : null
            const inner = (
              <>
                <BrandLogo brand={b} className="frd-brand-logo" />
                <span className="frd-row-mid"><b>{b.name}</b><small>{t('ob_gift')}</small></span>
                {friend && <WishPill status={status} thanked={w?.thanked} delivered={w?.delivered} openedAt={w?.openedAt} name={profile.name} onCall={() => setGiftBrand(b)} />}
              </>
            )
            return mineGoalId
              ? <button type="button" className="frd-brand-row frd-wish-open" key={b.key} onClick={() => go('goal', { goalId: mineGoalId })}>{inner}</button>
              : <div className="frd-brand-row" key={b.key}>{inner}</div>
          })}
        </section>
      )}
      {giftBrand && <BrandSheet brand={giftBrand} onClose={() => setGiftBrand(null)} onPick={pickGift} />}
    </>
  )
}

// Avatar, name and the level/since line, shared by a friend's profile and the "see it as a friend" preview.
// The avatar is the one the friend chose to share (a letter avatar when they do not), never an identicon of a seed.
function ProfileHead({ profile, since, banner }) {
  const { t, lang } = useApp()
  const parts = []
  if (profile.level) parts.push(t('frd_level_rank', { n: profile.level.level, rank: t(`rank_${profile.level.rank}`) }))
  if (since) parts.push(t('frd_since', { date: fmtSince(since, lang) }))
  return (
    <div className="frd-prof-head">
      <FriendAvatar avatar={profile.avatar} name={profile.name} size={64} frame={profile.look?.frame} />
      <h3 className={accentClass(profile.look?.accent)}>{profile.name}</h3>
      {parts.length > 0 && <p className="frd-sub">{parts.join(' · ')}</p>}
      {banner && <p className="frd-asfriend-banner">{banner}</p>}
    </div>
  )
}

// ---- a friend's profile -------------------------------------------------------------------------------------
function FriendProfileView({ id, since }) {
  const { t, back, address } = useApp()
  const [profile, setProfile] = useState(null)
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(false)

  const load = () => {
    setErr(false); setLoading(true)
    loadProfile(id).then((p) => {
      setProfile(p); setLoading(false)
      // Persist a friend's thanks onto the local gift tag, so the code screen can show "{name} says thanks" too.
      for (const [brandKey, v] of Object.entries(p.wishes || {})) {
        if (v?.status === 'mine_sent' && v.thanked) { const gid = findGiftGoal(address, id, brandKey); if (gid) setThanked(gid) }
      }
    }).catch(() => { setErr(true); setLoading(false) })
  }
  useEffect(load, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        {loading && <Skeleton rows={4} />}
        {err && <FriendNotice onRetry={() => { setLoading(true); load() }} />}
        {profile && (
          <>
            <ProfileHead profile={profile} since={since} />
            <ProfileCards profile={profile} friend={{ id, name: profile.name }} />
            <PrivateLine name={profile.name} hidden={profile.hidden} />
            <button type="button" className="frd-muted-link" onClick={() => setConfirm(true)}>{t('frd_remove')}</button>
          </>
        )}
      </main>
      {confirm && (
        <ConfirmSheet title={t('frd_remove_title', { name: profile.name })} body={t('frd_remove_note')} danger
          confirmLabel={t('frd_remove_btn')} cancelLabel={t('frd_keep')}
          onConfirm={async () => { await removeFriend(id); back() }} onClose={() => setConfirm(false)} />
      )}
    </>
  )
}

// ---- my profile ---------------------------------------------------------------------------------------------
function NameSheet({ initial, onClose }) {
  const { t } = useApp()
  const [name, setName] = useState(initial || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const clean = name.trim().slice(0, NAME_MAX)
  const save = async () => {
    setBusy(true); setErr(false)
    try { await patchMe({ name: clean }); onClose() } catch { setErr(true); setBusy(false) }
  }
  return (
    <Sheet title={t('name_label')} onClose={busy ? () => {} : onClose}>
      <input className="name-input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={t('name_label')} />
      {err && <p className="frd-quiet">{t('frd_save_fail')}</p>}
      <button type="button" className="btn" disabled={busy || !clean} onClick={save}>{t('redeem_continue')}</button>
    </Sheet>
  )
}

const VIS_ITEMS = [
  { key: 'avatar', label: 'frd_item_avatar', sub: 'frd_item_avatar_sub', isNew: true },
  { key: 'level', label: 'frd_item_level' },
  { key: 'badges', label: 'frd_item_badges' },
  { key: 'totals', label: 'frd_item_totals', sub: 'frd_item_totals_sub', isNew: true },
  { key: 'goals', label: 'frd_item_goals', sub: 'frd_item_goals_sub' },
  { key: 'cards', label: 'frd_item_cards', sub: 'frd_item_cards_sub' },
  { key: 'wishlist', label: 'frd_item_wishlist' },
]
const AMOUNT_KEYS = new Set(['totals', 'goals', 'cards']) // the first of these shown asks once
const amountsOk = () => { try { return localStorage.getItem('dibs.frdAmountsOk') === '1' } catch { return false } }
const markAmountsOk = () => { try { localStorage.setItem('dibs.frdAmountsOk', '1') } catch { /* private mode */ } }

function MyProfileView() {
  const { t, address, walletAddress, back } = useApp()
  const st = getState()
  const xp = useXp(address)
  const look = useLook(xp.level) // my accent and frame (lib/looks.js)
  const [vis, setVis] = useState(() => getVis())
  const [saveErr, setSaveErr] = useState(false)
  const [editName, setEditName] = useState(false)
  const [preview, setPreview] = useState(null) // the as-friend profile, or 'loading'/'error'
  const [confirm, setConfirm] = useState(false)
  const [amountAsk, setAmountAsk] = useState(null) // { key, val } waiting for the one-time amount confirmation
  // The NEW pills stay visible for the whole first visit; the flag is saved when the page is left.
  const [showNew] = useState(() => { try { return localStorage.getItem('dibs.frdNew142') !== '1' } catch { return true } })
  useEffect(() => () => { try { localStorage.setItem('dibs.frdNew142', '1') } catch { /* private mode */ } }, [])

  const doChangeVis = async (key, val) => {
    const prev = vis
    setVis({ ...vis, [key]: val }); setSaveErr(false)
    try { await patchMe({ visibility: { [key]: val } }); syncQuiet(address, walletAddress) }
    catch { setVis(prev); setSaveErr(true) }
  }
  const changeVis = (key, val) => {
    // First time an amount (totals, goals or cards) is turned on: ask once, before anything is saved or sent.
    if (AMOUNT_KEYS.has(key) && val !== 'off' && vis[key] === 'off' && !amountsOk()) { setAmountAsk({ key, val }); return }
    doChangeVis(key, val)
  }

  const openPreview = () => { setPreview('loading'); loadAsFriend().then(setPreview).catch(() => setPreview('error')) }

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <div className="frd-prof-head">
          <Avatar address={walletAddress} size={64} frame={look.frame}
            fallback={st?.name ? <span className="prof-avatar" aria-hidden="true">{st.name.charAt(0).toUpperCase()}</span> : null} />
          <button type="button" className={`frd-name-edit ${accentClass(accentChoice(xp.level))}`} onClick={() => setEditName(true)}>{st?.name}<span className="frd-pencil" aria-hidden="true">✎</span></button>
          <p className="frd-sub">{t('frd_level_rank', { n: xp.level, rank: t(`rank_${xp.rank.id}`) })} · {st?.code}</p>
        </div>

        <section className="card frd-card">
          <h3>{t('frd_who')}</h3>
          {VIS_ITEMS.map((it) => (
            <div className="frd-vis-row" key={it.key}>
              <div className="frd-vis-head"><b>{t(it.label)}{it.isNew && showNew && <span className="frd-new-pill">{t('frd_new')}</span>}</b>{it.sub && <small>{t(it.sub)}</small>}</div>
              <ThreeWay value={vis[it.key]} onChange={(v) => changeVis(it.key, v)} />
            </div>
          ))}
          {saveErr && <p className="frd-quiet">{t('frd_save_fail')}</p>}
          <p className="frd-note">{t('frd_who_note')}</p>
        </section>

        <button type="button" className="btn ghost" onClick={openPreview}>{t('frd_see_as_friend')}</button>
        <button type="button" className="frd-muted-link" onClick={() => setConfirm(true)}>{t('frd_delete_link')}</button>
      </main>

      {amountAsk && (
        <AmountConsentSheet itemKey={amountAsk.key} value={amountAsk.val}
          onConfirm={() => { markAmountsOk(); const { key, val } = amountAsk; setAmountAsk(null); doChangeVis(key, val) }}
          onClose={() => setAmountAsk(null)} />
      )}
      {editName && <NameSheet initial={st?.name} onClose={() => setEditName(false)} />}
      {preview && (
        <Sheet label={t('frd_as_friend_banner')} onClose={() => setPreview(null)}>
          {preview === 'loading' && <Skeleton rows={3} />}
          {preview === 'error' && <FriendNotice onRetry={openPreview} />}
          {preview && preview !== 'loading' && preview !== 'error' && (
            <>
              <ProfileHead profile={preview} banner={t('frd_as_friend_banner')} />
              <ProfileCards profile={preview} />
              <PrivateLine name={preview.name} hidden={preview.hidden} />
            </>
          )}
        </Sheet>
      )}
      {confirm && (
        <ConfirmSheet title={t('frd_delete_title')} body={t('frd_delete_note')} danger
          confirmLabel={t('frd_delete_btn')} cancelLabel={t('frd_keep')}
          onConfirm={async () => { await turnOff({ deleteProfile: true }); back() }} onClose={() => setConfirm(false)} />
      )}
    </>
  )
}

export default function FriendProfile({ me, id, since }) {
  const { back } = useApp()
  if (me) return <MyProfileView />
  if (id) return <FriendProfileView id={id} since={since} />
  back()
  return null
}
