import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { itemLabel } from '../lib/itemName.js'
import { BrandLogo, FieldError, Notice, Sheet } from '../components/ui.jsx'
import { FriendAvatar } from '../components/Avatar.jsx'
import { accentClass } from '../components/LookParts.jsx'
import { listGoals, moveNim, progress, removeGoal, savedNim } from '../lib/goals.js'
import { goalBrand } from './Home.jsx'
import { fmtNim } from '../lib/format.js'
import { track } from '../lib/stats.js'
import { manageRows } from '../lib/manage.js'
import { giftOf, setGift } from '../lib/gifts.js'
import { isOn as friendsIsOn, loadFriends } from '../lib/friends.js'
import { goalVersion } from '../lib/version.js'

const parseNim = (v) => Math.floor(Number(String(v).replace(/[^\d.]/g, ''))) || 0
// title: at the start of a line or title; false inside a sentence.
export const goalLabel = (g, t, title = false) => itemLabel(t, g, { title })

// Stroke icons for the Manage sheet (text glyphs like ↩ turn into emoji on iOS).
const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const IconMove = () => <Icon><path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4" /></Icon>
const IconBack = () => <Icon><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>
const IconCard = () => <Icon><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></Icon>
const IconDelete = () =><Icon><path d="M6 6l12 12M18 6 6 18" /></Icon>
const IconGift = () => <Icon><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3 8 3a2 2 0 0 0 0 5h4M12 8s1.5-5 4-5a2 2 0 0 1 0 5h-4" /></Icon>

// Frame 2: Change card (saving, ready, and unlocking for the card: then Change card only), Move (saving only: the ledger moves NIM between saving goals),
// Get my NIM back, Delete (off while the goal still holds NIM).
// Change card opens the catalogue in change mode (Catalog changeFor → Plan), exactly as CardIssue's Change card: no
// transaction, NIM and history kept, the old card kept in cardChanges.
export function ManageSheet({ goal, onClose, onChange, onMove, onWithdraw, onDelete, onGift, onKeep }) {
  const { t, lang } = useApp()
  const saved = savedNim(goal)
  const rows = manageRows(goal) // unlocking for the card: Change card only
  // Gift this card (v1.7.4): on saving and ready goals, with or without NIM, only when Friends is set up. A goal already
  // tagged for a direct gift (not yet sent) shows "Keep it for me" instead (undo); a sent direct tag shows no row, and a
  // wishlist-gift goal (already someone's gift) shows no row either.
  const tag = friendsIsOn() ? giftOf(goal.id) : null
  const giftable = friendsIsOn() && (goal.status === 'saving' || goal.status === 'ready')
  const giftRow = !giftable || (tag && !tag.direct) ? null : !tag ? 'gift' : tag.state !== 'sent' ? 'keep' : null
  return (
    <Sheet title={t('manage_title')} onClose={onClose}>
      <div className="sheet-list">
        {rows.includes('change') && onChange && (
          <button type="button" className="sheet-row" onClick={onChange}>
            <span className="si move" aria-hidden="true"><IconCard /></span>
            <span><b>{t('manage_change')}</b><small>{t('manage_change_sub')}</small></span>
          </button>
        )}
        {giftRow === 'gift' && onGift && (
          <button type="button" className="sheet-row" onClick={onGift}>
            <span className="si gift" aria-hidden="true"><IconGift /></span>
            <span><b>{t('og_entry')}</b><small>{t('og_entry_sub')}</small></span>
          </button>
        )}
        {giftRow === 'keep' && onKeep && (
          <button type="button" className="sheet-row" onClick={onKeep}>
            <span className="si gift" aria-hidden="true"><IconGift /></span>
            <span><b>{t('og_keep')}</b><small>{t('og_keep_sub', { name: tag.name })}</small></span>
          </button>
        )}
        {rows.includes('move') && (
          <button type="button" className="sheet-row" disabled={saved <= 0} onClick={onMove}>
            <span className="si move" aria-hidden="true"><IconMove /></span>
            <span><b>{t('manage_move')}</b><small>{t('manage_move_sub')}</small></span>
          </button>
        )}
        {rows.includes('back') && (
          <button type="button" className="sheet-row" disabled={saved <= 0} onClick={onWithdraw}>
            <span className="si back" aria-hidden="true"><IconBack /></span>
            <span><b>{t('manage_back')}</b><small>{goal.status === 'ready' ? t('goal_ready') : t('manage_back_sub')}</small></span>
          </button>
        )}
        {rows.includes('delete') && (
          <button type="button" className="sheet-row danger" disabled={saved > 0} onClick={onDelete}>
            <span className="si del" aria-hidden="true"><IconDelete /></span>
            <span><b>{t('manage_delete')}</b><small>{saved > 0 ? t('manage_delete_blocked', { nim: fmtNim(saved, lang) }) : t('manage_delete_empty')}</small></span>
          </button>
        )}
      </div>
      <button type="button" className="btn ghost" onClick={onClose}>{t('manage_cancel')}</button>
    </Sheet>
  )
}

// Frame 3: pick a saving goal (or a new one), pick an amount, move. Ledger only, no Nimiq Pay step.
export function MoveSheet({ goal, preselect = null, onClose, onMoved }) {
  const { t, lang, address, go, toast } = useApp()
  const saved = savedNim(goal)
  const targets = listGoals(address).filter((g) => g.id !== goal.id && g.status === 'saving')
  const [to, setTo] = useState(() => (targets.some((g) => g.id === preselect) ? preselect : targets.length === 1 ? targets[0].id : null))
  const [mode, setMode] = useState('all')
  const [other, setOther] = useState('')
  const nim = mode === 'all' ? saved : mode === 'half' ? Math.floor(saved / 2) : parseNim(other)
  const tooMuch = mode === 'other' && nim > saved
  const target = targets.find((g) => g.id === to)
  const ok = target && nim > 0 && !tooMuch

  const move = () => {
    if (!ok) return
    try {
      const r = moveNim(address, goal.id, target.id, nim)
      track('move', { nim })
      toast(t('move_done', { nim: fmtNim(nim, lang), name: goalLabel(target, t) }))
      onMoved(r)
    } catch {
      toast(t('move_fail'))
    }
  }

  return (
    <Sheet title={t('move_title')} onClose={onClose}>
      <p className="small">{t('move_from', { name: goalLabel(goal, t), nim: fmtNim(saved, lang) })}</p>
      <span className="small sheet-label">{t('move_to')}</span>
      <div className="sheet-list" role="radiogroup" aria-label={t('move_to')}>
        {targets.map((g) => {
          const left = Math.max(0, g.targetNim - savedNim(g))
          return (
            <button type="button" key={g.id} role="radio" aria-checked={g.id === to} className={`sheet-row pick-goal${g.id === to ? ' on' : ''}`} onClick={() => setTo(g.id)}>
              <BrandLogo brand={goalBrand(g)} />
              <span><b>{goalLabel(g, t, true)}</b><small>{t('move_goal_meta', { pct: Math.round(progress(g) * 100), nim: fmtNim(left, lang) })}</small></span>
              <span className="radio" aria-hidden="true" />
            </button>
          )
        })}
        <button type="button" className="sheet-row pick-goal new" onClick={() => { onClose(); go('catalog', { moveFrom: goal.id }) }}>
          <span className="si plus" aria-hidden="true">+</span>
          <span><b>{t('move_new')}</b><small>{t('move_new_sub')}</small></span>
        </button>
      </div>
      <span className="small sheet-label">{t('move_amount')}</span>
      <div className="pills" role="group" aria-label={t('move_amount')}>
        {[['all', t('move_all')], ['half', t('move_half')], ['other', t('move_other')]].map(([k, label]) => (
          <button type="button" key={k} className={`pill${mode === k ? ' on' : ''}`} aria-pressed={mode === k} disabled={k === 'half' && saved < 2} onClick={() => setMode(k)}>{label}</button>
        ))}
      </div>
      {mode === 'other' && (
        <>
          <div className={`amount${tooMuch ? ' bad' : ''}`}>
            <input inputMode="numeric" autoFocus aria-label={t('move_amount')} value={other} onChange={(e) => setOther(e.target.value)} placeholder="0" />
            <span>NIM</span>
          </div>
          {tooMuch && <FieldError>{t('move_too_much', { nim: fmtNim(saved, lang) })}</FieldError>}
        </>
      )}
      <button type="button" className="btn tall" disabled={!ok} onClick={move}>
        {target ? t('move_cta', { nim: fmtNim(nim, lang), name: goalLabel(target, t) }) : t('move_pick')}
        <small>{t('move_cta_sub')}</small>
      </button>
    </Sheet>
  )
}

// Frame 6: confirm, delete, back to Home.
export function DeleteSheet({ goal, onClose }) {
  const { t, address, reset, toast } = useApp()
  const del = () => {
    try {
      removeGoal(address, goal.id)
      track('goal_deleted', { goalId: goal.id })
      toast(t('delete_done'))
      reset('home')
    } catch {
      toast(t('delete_fail'))
      onClose()
    }
  }
  return (
    <Sheet title={t('delete_title', { name: goalLabel(goal, t) })} onClose={onClose}>
      <p className="small">{t('delete_sub')}</p>
      <button type="button" className="btn danger" onClick={del}>{t('delete_cta')}</button>
      <button type="button" className="btn ghost" onClick={onClose}>{t('manage_cancel')}</button>
    </Sheet>
  )
}

// Gift this card (v1.7.4): pick a friend to gift one of your own goals to. The goal and its NIM stay yours; this only
// writes a local tag (no server call, no chain call). The friend is not told until the card is yours and you send it.
// Loads the friends list from the server (no list from memory); empty and unreachable states are handled inline.
export function GiftPickerSheet({ goal, onClose, onTagged }) {
  const { t, lang, go, toast } = useApp()
  const brand = goalBrand(goal)
  const version = goalVersion(goal)
  const [friends, setFriends] = useState(null) // null while loading, [] none, [...] the list
  const [err, setErr] = useState(false)
  const [sel, setSel] = useState(null)
  const [q, setQ] = useState('')

  const load = () => {
    setErr(false); setFriends(null)
    loadFriends().then((r) => setFriends(Array.isArray(r?.friends) ? r.friends : [])).catch(() => setErr(true))
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selFriend = (friends || []).find((f) => f.id === sel) || null
  const showSearch = (friends?.length || 0) > 8
  const query = q.trim().toLowerCase()
  const shown = showSearch && query ? friends.filter((f) => String(f.name).toLowerCase().includes(query)) : (friends || [])

  const gift = () => {
    if (!selFriend) return
    // Tag only: no server call, no chain call, the goal object and its money path are untouched.
    setGift(goal.id, { friendId: selFriend.id, name: selFriend.name, brandKey: goal.brandKey, state: 'claimed', direct: true })
    toast(t('og_tagged', { name: selFriend.name }))
    onTagged?.(selFriend)
  }

  // Unreachable: the one gift-unreachable notice with Retry, never a list rebuilt from memory.
  if (err) {
    return (
      <Sheet title={t('og_title')} onClose={onClose}>
        <Notice tone="info" title={t('frd_gift_unreachable')} actions={[{ label: t('retry'), onClick: load }]} />
        <button type="button" className="btn ghost" onClick={onClose}>{t('manage_cancel')}</button>
      </Sheet>
    )
  }

  // No friends: invite first.
  if (friends && friends.length === 0) {
    return (
      <Sheet title={t('og_title')} onClose={onClose}>
        <div className="og-empty">
          <span className="og-empty-ic" aria-hidden="true"><IconGift /></span>
          <b>{t('og_empty_title')}</b>
          <p className="small">{t('og_empty_sub')}</p>
        </div>
        <button type="button" className="btn" onClick={() => { onClose(); go('friends') }}>{t('og_empty_cta')}</button>
        <button type="button" className="btn ghost" onClick={onClose}>{t('manage_cancel')}</button>
      </Sheet>
    )
  }

  return (
    <Sheet title={t('og_title')} onClose={onClose}>
      <p className="small">{t('og_sub')}</p>
      {showSearch && (
        <input className="frd-code-in og-search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t('og_search')} aria-label={t('og_search')} autoCorrect="off" spellCheck={false} />
      )}
      <div className="sheet-list og-friends" role="radiogroup" aria-label={t('og_title')}>
        {friends == null ? (
          <div className="frd-skel" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="frd-skel-row" />)}</div>
        ) : shown.map((f) => (
          <button type="button" key={f.id} role="radio" aria-checked={f.id === sel}
            className={`sheet-row pick-goal${f.id === sel ? ' on' : ''}`} onClick={() => setSel(f.id)}>
            <FriendAvatar avatar={f.avatar} name={f.name} size={40} className="frd-av" frame={f.look?.frame} />
            <span><b className={accentClass(f.look?.accent)}>{f.name}</b>
              {f.level != null && <small>{t('frd_level_rank', { n: f.level, rank: t(`rank_${f.rank}`) })}</small>}</span>
            <span className="radio" aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="og-version">
        <BrandLogo brand={brand} className="frd-brand-logo" />
        <span className="frd-row-mid">
          <b>{itemLabel(t, goal, { title: true })}</b>
          {version.worksWith && <small>{version.worksWith}</small>}
          {selFriend && <small className="og-version-check">{t('og_check', { name: selFriend.name })}</small>}
        </span>
      </div>

      <button type="button" className="btn tall" disabled={!selFriend} onClick={gift}>
        {selFriend ? t('og_cta', { name: selFriend.name }) : t('og_pick')}
      </button>
      {selFriend && <p className="small og-surprise">{t('og_surprise', { name: selFriend.name })}</p>}
      <button type="button" className="btn ghost" onClick={onClose}>{t('manage_cancel')}</button>
    </Sheet>
  )
}
