// Friends: the shared pieces (the turn-on sheet, the profile-back sheet, the add-by-code sheet, confirm sheets,
// the 3-way visibility switch, rows and the notice). Screens Friends.jsx and FriendProfile.jsx build on these.
import { useEffect, useState } from 'react'
import { useApp, useBlockBack } from '../App.jsx'
import { Sheet, Notice } from './ui.jsx'
import { Avatar, FriendAvatar } from './Avatar.jsx'
import { getName } from '../lib/name.js'
import { NAME_MAX } from '../lib/name.js'
import { copyText } from '../lib/clipboard.js'
import { BRANDS, catalogBrands } from '../lib/brands.js'
import { getWishlist, subscribe as subscribeWishlist } from '../lib/wishlist.js'
import {
  turnOn, getState, getBackSeen, markBackSeen, getFriends, sendInvite, lookup, syncQuiet, inviteText,
} from '../lib/friends.js'

// A friends error code -> a user-facing message. Anything else is the generic save failure.
export const errMsg = (t, code) => ({
  BAD_CODE: t('frd_err_bad_code'),
  OWN_CODE: t('frd_err_own'),
  ALREADY_FRIENDS: t('frd_err_already'),
  LIMIT: t('frd_err_limit'),
}[code] || t('frd_save_fail'))

// A brand object for a stored brand key (catalogue first, then the static list). Unknown keys return null.
export const brandByKey = (key) => (key ? catalogBrands().find((b) => b.key === key) || BRANDS.find((b) => b.key === key) || null : null)

// The item names used in the "keeps some things private" line and the switches. On Friends surfaces badges is "Badges"
// (frd_item_badges), not the Profile tab's "Your badges" (badges_title).
export const itemLabel = (t, key) => ({ avatar: t('frd_item_avatar'), level: t('frd_item_level'), badges: t('frd_item_badges'), totals: t('frd_item_totals'), cards: t('frd_item_cards'), goals: t('frd_item_goals'), wishlist: t('frd_item_wishlist') }[key] || key)

// Live Friends state for the screens that react to turn-on / off and visibility changes.
export function useFriends() {
  const [v, setV] = useState(() => getState())
  useEffect(() => {
    const on = () => setV(getState())
    window.addEventListener('dibs:friends', on)
    return () => window.removeEventListener('dibs:friends', on)
  }, [])
  return v
}

// Live wishlist (dibs.wishlist), for the Catalog hearts, the Profile row and the Wishlist screen.
export function useWishlist() {
  const [list, setList] = useState(getWishlist)
  useEffect(() => subscribeWishlist(() => setList(getWishlist())), [])
  return list
}

// Off / Friends / Everyone, as a segmented control. Full width so the labels fit at 360 px, including fr.
export function ThreeWay({ value, onChange, disabled }) {
  const { t } = useApp()
  const opts = [['off', t('frd_off')], ['friends', t('frd_title')], ['everyone', t('frd_everyone')]]
  return (
    <div className="frd-seg" role="group">
      {opts.map(([o, label]) => (
        <button type="button" key={o} lang={undefined} aria-pressed={o === value} disabled={disabled}
          className={o === value ? 'on' : ''} onClick={() => o !== value && onChange(o)}>{label}</button>
      ))}
    </div>
  )
}

export function Skeleton({ rows = 3 }) {
  return <div className="frd-skel" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="frd-skel-row" />)}</div>
}

// The one notice for a Friends screen that cannot load (down or timeout). Never shown on other screens.
export function FriendNotice({ onRetry }) {
  const { t } = useApp()
  return <Notice tone="info" title={t('frd_down_title')} sub={t('frd_down_sub')} actions={onRetry ? [{ label: t('retry'), onClick: onRetry }] : []} />
}

// A person row: their shared Nimiq avatar when they share it, otherwise a Dibs letter avatar (never an identicon
// drawn from someone else's seed), a name, an optional sub-line, and a right slot.
export function PersonRow({ avatar, name, sub, right, onClick }) {
  const inner = (
    <>
      <FriendAvatar avatar={avatar} name={name} size={40} className="frd-av" />
      <span className="frd-row-mid"><b>{name}</b>{sub && <small>{sub}</small>}</span>
      {right}
    </>
  )
  return onClick
    ? <button type="button" className="frd-row" onClick={onClick}>{inner}</button>
    : <div className="frd-row">{inner}</div>
}

// The muted line naming what a friend keeps private (names only, never data).
export function PrivateLine({ name, hidden }) {
  const { t } = useApp()
  if (!Array.isArray(hidden) || !hidden.length) return null
  const list = hidden.map((k) => itemLabel(t, k)).join(', ')
  return <p className="frd-private">{t('frd_private_line', { name, list })}</p>
}

// A plain confirm sheet (remove a friend, delete the profile). danger makes the main button red.
export function ConfirmSheet({ title, body, confirmLabel, cancelLabel, danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const go = async () => {
    setBusy(true); setErr(null)
    try { await onConfirm() } catch (e) { setErr(e); setBusy(false) }
  }
  const { t } = useApp()
  return (
    <Sheet title={title} onClose={busy ? () => {} : onClose}>
      {body && <p className="frd-sheet-lead">{body}</p>}
      {err && <p className="frd-quiet">{t('frd_save_fail')}</p>}
      <button type="button" className={`btn${danger ? ' danger' : ''}`} disabled={busy} onClick={go}>{confirmLabel}</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>{cancelLabel}</button>
    </Sheet>
  )
}

// Asked once, before the first amount (totals, goals or cards) is shared. onConfirm saves and shares; onClose (the
// "Keep it off" button, the backdrop or Escape) leaves the row off and sends nothing.
export function AmountConsentSheet({ itemKey, value, onConfirm, onClose }) {
  const { t } = useApp()
  const everyone = value === 'everyone'
  const who = t(everyone ? 'frd_amt_who_everyone' : 'frd_amt_who_friends')
  const title = t(itemKey === 'totals' ? 'frd_amt_title_totals' : 'frd_amt_title_amounts')
  const body = t(itemKey === 'totals' ? 'frd_amt_body_totals' : 'frd_amt_body_amounts', { who })
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="frd-amt-notice"><i className="frd-amt-dot" aria-hidden="true" /><p>{body}</p></div>
      <button type="button" className="btn" onClick={onConfirm}>{t(everyone ? 'frd_amt_share_everyone' : 'frd_amt_share_friends')}</button>
      <button type="button" className="btn ghost" onClick={onClose}>{t('frd_amt_keep')}</button>
      <p className="frd-note">{t('frd_amt_note')}</p>
    </Sheet>
  )
}

// Turn-on sheet: name, the Shared row (Nothing), Turn on. Blocks back while Nimiq Pay is open.
export function TurnOnSheet({ onClose }) {
  const { t, address } = useApp()
  const [name, setName] = useState(() => getName())
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState(false)
  const [err, setErr] = useState(null)
  const [slow, setSlow] = useState(false) // the first register can take up to a minute while the server wakes up
  useBlockBack(busy)
  useEffect(() => {
    if (!busy) { setSlow(false); return undefined }
    const id = setTimeout(() => setSlow(true), 6000)
    return () => clearTimeout(id)
  }, [busy])
  const clean = name.trim().slice(0, NAME_MAX)

  const submit = async () => {
    setBusy(true); setRefused(false); setErr(null)
    try {
      const out = await turnOn(clean)
      syncQuiet(address)
      if (out.restored && !getBackSeen()) { markBackSeen(); try { window.dispatchEvent(new Event('dibs:friends:back')) } catch { /* no window */ } }
      onClose()
    } catch (e) {
      setBusy(false)
      if (e.friendsError === 'SIGN_REFUSED') setRefused(true)
      else setErr(e)
    }
  }

  return (
    <Sheet title={t('frd_turn_on')} onClose={busy ? () => {} : onClose}>
      <p className="frd-sheet-lead">{t('frd_turn_lead')}</p>
      <label className="small" htmlFor="frd-name">{t('name_label')}</label>
      <input id="frd-name" className="name-input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={t('name_label')} />
      <div className="frd-shared-row">
        <span><b>{t('frd_shared')}</b><small>{t('frd_shared_sub')}</small></span>
        <span className="frd-pill">{t('frd_nothing')}</span>
      </div>
      {refused && <p className="frd-quiet">{t('frd_sign_refused')}</p>}
      {err && <p className="frd-quiet">{t('frd_save_fail')}</p>}
      {busy && slow && !refused && !err && <p className="frd-quiet">{t('frd_connecting')}</p>}
      <button type="button" className="btn" disabled={busy || !clean} onClick={submit}>{busy ? t('restake_waiting') : t('frd_turn_on')}</button>
      <p className="frd-note">{t('frd_no_account')}</p>
    </Sheet>
  )
}

// Profile is back (register answered restored: true). Shown once; App.jsx renders it on the dibs:friends:back event.
export function ProfileBackSheet({ onClose }) {
  const { t, walletAddress } = useApp()
  const st = getState()
  const [n, setN] = useState(null)
  useEffect(() => { getFriends().then((f) => setN(f.friends?.length ?? 0)).catch(() => setN(null)) }, [])
  const line = n == null ? st?.name : t(n === 1 ? 'frd_back_line_one' : 'frd_back_line', { name: st?.name, n })
  return (
    <Sheet label={t('frd_back_title')} onClose={onClose}>
      <div className="frd-back">
        <Avatar address={walletAddress} size={72}
          fallback={st?.name ? <span className="prof-avatar" aria-hidden="true">{st.name.charAt(0).toUpperCase()}</span> : null} />
        <h3>{t('frd_back_title')}</h3>
        <p className="frd-back-line">{line}</p>
        <p className="frd-note">{t('frd_back_note')}</p>
      </div>
      <button type="button" className="btn" onClick={onClose}>{t('redeem_continue')}</button>
    </Sheet>
  )
}

// Add by code: type a code, look it up, send an invite. Prefill from a ?friend link.
export function AddByCodeSheet({ prefill, onClose, onSent }) {
  const { t, toast } = useApp()
  const [code, setCode] = useState(() => String(prefill || '').toUpperCase())
  const [match, setMatch] = useState(null) // { id, name, seed, level?, rank? }
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const normalized = code.trim().toUpperCase().replace(/^DIBS-?/, '')
  const full = normalized ? `DIBS-${normalized}` : ''

  // Look up on a short debounce once the code looks complete (4 to 5 characters).
  useEffect(() => {
    setMatch(null); setErr(null)
    if (normalized.length < 4) return undefined
    let live = true
    const id = setTimeout(() => {
      lookup(full).then((m) => { if (live) setMatch(m) }).catch((e) => { if (live) { setMatch(null); if (e.friendsError !== 'BAD_CODE') setErr(e) } })
    }, 300)
    return () => { live = false; clearTimeout(id) }
  }, [normalized]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setBusy(true); setErr(null)
    try { await sendInvite(full); toast(t('frd_invite_sent')); onSent?.() } catch (e) { setErr(e); setBusy(false) }
  }

  return (
    <Sheet title={t('frd_add_title')} onClose={busy ? () => {} : onClose}>
      <label className="small" htmlFor="frd-code">{t('frd_code_label')}</label>
      <input id="frd-code" className="frd-code-in" value={code} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="DIBS-" />
      {match && (
        <div className="frd-match">
          <FriendAvatar avatar={match.avatar} name={match.name} size={40} className="frd-av" />
          <span className="frd-row-mid"><b>{match.name}</b>{match.level != null && <small>{t('frd_level_rank', { n: match.level, rank: t(`rank_${match.rank}`) })}</small>}</span>
        </div>
      )}
      {err && <p className="frd-quiet">{errMsg(t, err.friendsError)}</p>}
      <button type="button" className="btn" disabled={busy || normalized.length < 4} onClick={send}>{t('frd_send_invite')}</button>
      <p className="frd-note">{t('frd_add_note', { name: match?.name || '' })}</p>
    </Sheet>
  )
}

// Share the invite: the code and where to type it, no link (a link opened the demo outside Nimiq Pay). The copy
// fallback uses the code-copied wording since there is no link any more.
export async function shareInvite(t, code, toast) {
  const text = inviteText(t, code)
  try { if (navigator.share) { await navigator.share({ text }); return } } catch { /* cancelled or unavailable */ }
  if (await copyText(text)) toast(t('done_copied'))
}
export async function copyCode(t, code, toast) { if (await copyText(code)) toast(t('done_copied')) }
