// Two profiles in one screen: me:true is My profile (name, who-sees-what switches, see-as-friend, delete);
// an id is a friend's profile (only the cards the server returned, plus what they keep private, and Remove friend).
import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Sheet, BrandLogo } from '../components/ui.jsx'
import { Avatar } from '../components/Avatar.jsx'
import { Medal } from '../components/Badge.jsx'
import { badgeById } from '../lib/badges.js'
import { NAME_MAX } from '../lib/name.js'
import { useXp } from '../lib/useXp.js'
import {
  ThreeWay, ConfirmSheet, PrivateLine, Skeleton, FriendNotice, brandByKey,
} from '../components/FriendsParts.jsx'
import { getState, getVis, patchMe, syncQuiet, turnOff, loadProfile, loadAsFriend, removeFriend } from '../lib/friends.js'

const fmtSince = (iso, lang) => { try { return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) } catch { return '' } }

// The cards a friend profile shows: only the items present in the response. Unknown ids or brand keys are skipped.
function ProfileCards({ profile }) {
  const { t } = useApp()
  const badges = (profile.badges || []).filter((id) => badgeById(id))
  const wishlist = (profile.wishlist || []).map(brandByKey).filter(Boolean)
  const cards = (profile.cards || []).map(brandByKey).filter(Boolean)
  const goals = (profile.goals || []).filter((g) => brandByKey(g.brandKey))
  return (
    <>
      {badges.length > 0 && (
        <section className="card frd-card">
          <div className="sec-head"><h3>{t('frd_item_badges')}</h3><span className="small">{badges.length}</span></div>
          <div className="frd-badge-grid">{badges.map((id) => (
            <span key={id} className="frd-badge"><Medal id={id} earned size={48} /><small>{t(`badge_${id}`)}</small></span>
          ))}</div>
        </section>
      )}
      {wishlist.length > 0 && (
        <section className="card frd-card">
          <div className="sec-head"><h3>{t('frd_item_wishlist')}</h3></div>
          {wishlist.map((b) => (
            <div className="frd-brand-row" key={b.key}><BrandLogo brand={b} className="frd-brand-logo" /><span className="frd-row-mid"><b>{b.name}</b><small>{t('ob_gift')}</small></span></div>
          ))}
        </section>
      )}
      {cards.length > 0 && (
        <section className="card frd-card">
          <div className="sec-head"><h3>{t('frd_item_cards')}</h3><span className="small">{t('frd_brands_only')}</span></div>
          <div className="frd-logo-wrap">{cards.map((b) => <BrandLogo key={b.key} brand={b} className="frd-brand-logo" />)}</div>
        </section>
      )}
      {goals.length > 0 && (
        <section className="card frd-card">
          <div className="sec-head"><h3>{t('frd_item_goals')}</h3></div>
          {goals.map((g, i) => {
            const b = brandByKey(g.brandKey)
            return (
              <div className="frd-goal-row" key={g.brandKey + i}>
                <BrandLogo brand={b} className="frd-brand-logo" />
                <span className="frd-row-mid"><b>{b.name}</b><span className="frd-goalbar" aria-hidden="true"><i style={{ width: `${g.pct}%` }} /></span></span>
                <span className="frd-pct">{g.pct}%</span>
              </div>
            )
          })}
        </section>
      )}
    </>
  )
}

// Avatar, name and the level/since line, shared by a friend's profile and the "see it as a friend" preview.
function ProfileHead({ profile, since, banner }) {
  const { t, lang } = useApp()
  const parts = []
  if (profile.level) parts.push(t('frd_level_rank', { n: profile.level.level, rank: t(`rank_${profile.level.rank}`) }))
  if (since) parts.push(t('frd_since', { date: fmtSince(since, lang) }))
  return (
    <div className="frd-prof-head">
      <Avatar seed={profile.seed || profile.id} size={64} />
      <h3>{profile.name}</h3>
      {parts.length > 0 && <p className="frd-sub">{parts.join(' · ')}</p>}
      {banner && <p className="frd-asfriend-banner">{banner}</p>}
    </div>
  )
}

// ---- a friend's profile -------------------------------------------------------------------------------------
function FriendProfileView({ id, since }) {
  const { t, back } = useApp()
  const [profile, setProfile] = useState(null)
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(false)

  const load = () => { setErr(false); setLoading(true); loadProfile(id).then((p) => { setProfile(p); setLoading(false) }).catch(() => { setErr(true); setLoading(false) }) }
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
            <ProfileCards profile={profile} />
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
      <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={t('name_label')} />
      {err && <p className="frd-quiet">{t('frd_save_fail')}</p>}
      <button type="button" className="btn" disabled={busy || !clean} onClick={save}>{t('redeem_continue')}</button>
    </Sheet>
  )
}

const VIS_ITEMS = [
  { key: 'level', label: 'frd_item_level' },
  { key: 'badges', label: 'frd_item_badges' },
  { key: 'cards', label: 'frd_item_cards', sub: 'frd_brands_only' },
  { key: 'goals', label: 'frd_item_goals' },
  { key: 'wishlist', label: 'frd_item_wishlist' },
]

function MyProfileView() {
  const { t, address, back } = useApp()
  const st = getState()
  const xp = useXp(address)
  const [vis, setVis] = useState(() => getVis())
  const [saveErr, setSaveErr] = useState(false)
  const [editName, setEditName] = useState(false)
  const [preview, setPreview] = useState(null) // the as-friend profile, or 'loading'/'error'
  const [confirm, setConfirm] = useState(false)

  const changeVis = async (key, val) => {
    const prev = vis
    setVis({ ...vis, [key]: val }); setSaveErr(false)
    try { await patchMe({ visibility: { [key]: val } }); syncQuiet(address) }
    catch { setVis(prev); setSaveErr(true) }
  }

  const openPreview = () => { setPreview('loading'); loadAsFriend().then(setPreview).catch(() => setPreview('error')) }

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <div className="frd-prof-head">
          <Avatar seed={st?.id} size={64} />
          <button type="button" className="frd-name-edit" onClick={() => setEditName(true)}>{st?.name}<span className="frd-pencil" aria-hidden="true">✎</span></button>
          <p className="frd-sub">{t('frd_level_rank', { n: xp.level, rank: t(`rank_${xp.rank.id}`) })} · {st?.code}</p>
        </div>

        <section className="card frd-card">
          <h3>{t('frd_who')}</h3>
          {VIS_ITEMS.map((it) => (
            <div className="frd-vis-row" key={it.key}>
              <div className="frd-vis-head"><b>{t(it.label)}</b>{it.sub && <small>{t(it.sub)}</small>}</div>
              <ThreeWay value={vis[it.key]} onChange={(v) => changeVis(it.key, v)} />
            </div>
          ))}
          {saveErr && <p className="frd-quiet">{t('frd_save_fail')}</p>}
          <p className="frd-note">{t('frd_who_note')}</p>
        </section>

        <button type="button" className="btn ghost" onClick={openPreview}>{t('frd_see_as_friend')}</button>
        <button type="button" className="frd-muted-link" onClick={() => setConfirm(true)}>{t('frd_delete_link')}</button>
      </main>

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
