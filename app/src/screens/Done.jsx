import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { detailText, itemLabel } from '../lib/itemName.js'
import { Header, BrandLogo, Icon, useFiat } from '../components/ui.jsx'
import { goalBrand } from './Home.jsx'
import { goalVersion } from '../lib/version.js'
import { getGoal, updateGoal, savedNim } from '../lib/goals.js'
import { api } from '../lib/api.js'
import { config } from '../lib/config.js'
import { isDemo } from '../lib/nimiq.js'
import { track } from '../lib/stats.js'
import { txHash, shortHash } from '../lib/history.js'
import { copyText } from '../lib/clipboard.js'
import { fmtNim, fmtDate } from '../lib/format.js'
import { fmtFiatValue } from '../lib/fiatValue.js'
import { brandGrad } from '../lib/brands.js'
import { playPop, playGoalDone, playTing, playClink } from '../lib/sound.js'
import DidYouKnow from '../components/DidYouKnow.jsx'
import { giftOf, markSent as markGiftSent, sendSent, giftMessageError, getEncKeys, deliverGift, markDelivered, sendDirectGift, deliverDirectGift, newGiftId, setGift, clearGift } from '../lib/gifts.js'
import { getState as friendsState, userProfile } from '../lib/friends.js'
import { seal } from '../lib/giftBox.js'
import GiftBanner from '../components/GiftBanner.jsx'
import { GiftPickerSheet } from './GoalManage.jsx'
import { useXp } from '../lib/useXp.js'
import { LEVEL_BANNERS, isUnlocked as bannerUnlocked } from '../lib/giftBanners.js'

// Bitrefill invoice statuses, in order. Anything else shows as "waiting".
const STEPS = ['created', 'payment_detected', 'payment_confirmed', 'complete']
// The four gift banner designs, shown as a horizontal picker with None (components/GiftBanner.jsx).
const GIFT_BANNERS = ['birthday', 'thanks', 'congrats', 'because']

// Days from calling dibs to paying, at least 1.
const daysToYours = (goal) => Math.max(1, Math.ceil((Date.parse(goal.payment?.at || Date.now()) - Date.parse(goal.createdAt)) / 864e5))

// The shop's answer as kept on the goal. `code` from the server falls back to the PIN or the link
// (older contract), so drop it when it only repeats one of them.
function redemptionOf(o) {
  const link = o.link || null
  let pin = o.pin || null
  let code = o.code || null
  if (code && code === link) code = null
  if (code && code === pin) pin = null
  return code || pin || link ? { code, pin, link, at: new Date().toISOString() } : null
}

// Display-only: the entrance plays once per goal per session (session flag, not the chain, never a saved pointer).
const prefersReduced = () => { try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) } catch { return false } }
const SHOWN_KEY = (id) => `dibs.done.shown.${id}`
const wasShown = (id) => { try { return sessionStorage.getItem(SHOWN_KEY(id)) === '1' } catch { return false } }
const markShown = (id) => { try { sessionStorage.setItem(SHOWN_KEY(id), '1') } catch { /* display only */ } }

// Decorative confetti around the stamp: coral, mint, butter dots and squares. aria-hidden.
const CONFETTI = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']

// A revealed value, one span per character so each can rise in left to right (display only).
function RevealChars({ text }) {
  return [...String(text)].map((ch, i) => (
    <span key={i} className="tk-ch" style={{ animationDelay: `${i * 30}ms` }}>{ch === ' ' ? ' ' : ch}</span>
  ))
}

// Eye / eye-off glyph for the show-or-hide button (decorative; the button carries the label).
const EyeIcon = ({ off }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
)

// A gift box glyph for the "Gift this card" offer row (decorative; the row text carries the words).
const GiftGlyph = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3 8 3a2 2 0 0 0 0 5h4M12 8s1.5-5 4-5a2 2 0 0 1 0 5h-4" />
  </svg>
)

// A small padlock for a locked level banner (decorative; the line next to it carries the words).
const LockGlyph = () => (
  <svg className="gift-lock-ic" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)

export default function Done({ goalId, mode }) {
  const { t, lang, address, go, reset, toast } = useApp()
  const { level } = useXp(address)
  const goal = getGoal(address, goalId)
  const orderId = goal?.payment?.orderId
  const orderToken = goal?.payment?.orderToken || null // orders made before the per-order token have none: stay in the waiting state
  // Kept on the goal once delivered, so Past dibs can reopen it. Never logged or sent anywhere.
  const [red, setRed] = useState(() => goal?.payment?.redemption || null)
  const [status, setStatus] = useState(null)
  const [show, setShow] = useState(false)
  // Gift (v1.4.3): a goal called dibs on for a friend. The tag is local; the code is never part of the "mark as sent"
  // call. {me} is my Friends display name, for the prefilled note (kept on the phone only). v1.7.4: a direct gift (a card
  // you saved for, gifted from the goal's menu) uses the direct routes; `tagTick` re-reads the tag after tagging here.
  const [tagTick, setTagTick] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const sendRef = useRef(null)
  const giftTag = useMemo(() => giftOf(goalId), [goalId, tagTick])
  const isDirect = Boolean(giftTag?.direct)
  const meName = friendsState()?.name || ''
  const [note, setNote] = useState(() => (giftTag ? (giftTag.message ?? t('frd_gift_note_default', { me: meName })) : ''))
  const [banner, setBanner] = useState(() => giftTag?.banner || 'none')
  const [lockMsg, setLockMsg] = useState(null) // the level of a locked banner the user tapped, or null
  const pickBanner = (b) => { setBanner(b); setLockMsg(null) } // picking any unlocked banner clears the locked line
  const [sentState, setSentState] = useState(giftTag?.state === 'sent')
  const [sentErr, setSentErr] = useState(false)
  const [linkErr, setLinkErr] = useState(false)
  const [sending, setSending] = useState(false)
  // Send in Dibs (v1.7.3): deliver the code to the friend end to end encrypted. recipientKeys: null while loading, []
  // when the friend's Dibs has no key yet (fall back to Send with…), or the keys to seal a box for each of their devices.
  const [recipientKeys, setRecipientKeys] = useState(null)
  const [delivered, setDelivered] = useState(giftTag?.delivered || false)
  const [openedAt, setOpenedAt] = useState(null)

  // Polls our server until the shop delivers, then saves the redemption on the goal.
  useEffect(() => {
    if (config.redeemMode !== 'api' || !orderId || red) return
    const save = (r) => {
      const g = getGoal(address, goalId)
      if (g) updateGoal(address, goalId, { payment: { ...g.payment, redemption: r } })
      if (g) track('purchase', { goalId, itemId: g.itemId, usd: g.usd, tx: txHash(g.payment?.hash) || undefined }) // the order is complete
      setRed(r)
    }
    if (isDemo()) { const id = setTimeout(() => { setStatus('complete'); save(redemptionOf({ code: 'DEMO-CODE-0000' })) }, 3000); return () => clearTimeout(id) }
    if (!orderToken) return
    let stop = false
    const tick = async () => {
      try {
        const o = await api.order(orderId, orderToken)
        if (stop) return
        setStatus(o.status)
        const r = redemptionOf(o)
        if (r) { save(r); return }
      } catch { /* retry */ }
      if (!stop) setTimeout(tick, 5000)
    }
    tick()
    return () => { stop = true }
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Display-only entrance: first time the code (or the manual screen) is shown for this goal, this session.
  const reduced = prefersReduced()
  const final = config.redeemMode !== 'api' || Boolean(red)
  const [enter, setEnter] = useState(false)
  const [revealN, setRevealN] = useState(0)
  const [refOpen, setRefOpen] = useState(false)
  const playedRef = useRef(false)
  const fiat = useFiat()
  useEffect(() => {
    if (!goal || !final || playedRef.current) return
    playedRef.current = true
    if (wasShown(goalId)) return // reopened this session: everything at once, no entrance, no sound
    markShown(goalId)
    if (reduced) return
    setEnter(true)
    playPop({ ifUnlocked: true }) // needs an earlier tap; the goal-reached chime lands after it (and after any card-flip reveal)
    const chime = setTimeout(() => playGoalDone(), 100)
    return () => clearTimeout(chime)
  }, [final]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drop the entrance marker once the staggered steps have finished (last ~1.95 s). Keyed on `enter` (not the once-only
  // effect above) so StrictMode's double-invoke can't leave it stuck on: .done-enter then means "entrance in progress",
  // which the Badge earned banner waits on (components/BadgeStamp.jsx). Animations are backwards-filled and end on the
  // natural state, so dropping the class never snaps anything.
  useEffect(() => {
    if (!enter) return undefined
    const settle = setTimeout(() => setEnter(false), 2400)
    return () => clearTimeout(settle)
  }, [enter])

  // Send in Dibs: read the friend's gift-box keys (so the button knows if their Dibs can receive it), and, for a gift
  // already delivered, read whether they have opened it (the giver-only openedAt on their wishes map). Quiet on failure.
  useEffect(() => {
    if (!giftTag || !final || !red || !friendsState()?.on) return undefined
    let live = true
    getEncKeys(giftTag.friendId)
      .then((r) => { if (live) setRecipientKeys(Array.isArray(r?.encKeys) ? r.encKeys : []) })
      .catch(() => { if (live) setRecipientKeys([]) })
    if (giftTag.delivered) {
      userProfile(giftTag.friendId)
        .then((p) => {
          // A direct gift's opened time is on the giver's directSent list (by giftId); a wishlist gift's is on wishes.
          const openedAt = isDirect
            ? p?.directSent?.find((g) => g.giftId === giftTag.giftId)?.openedAt
            : p?.wishes?.[giftTag.brandKey]?.openedAt
          if (live && openedAt) setOpenedAt(openedAt)
        })
        .catch(() => { /* quiet: the waiting line stays */ })
    }
    return () => { live = false }
  }, [final]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!goal) return null
  const stepIdx = Math.max(0, STEPS.indexOf(status))
  const code = red?.code || null
  const pin = red?.pin || null
  const link = red?.link || null
  const safeLink = typeof link === 'string' && link.startsWith('https://') ? link : null // only https links are clickable
  const pinLabel = t('done_pin')
  const copyValue = code ? (pin ? `${code} · ${pinLabel}${lang === 'fr' ? ' : ' : ': '}${pin}` : code) : pin || link
  const hasCode = Boolean(code || pin)

  const brand = goalBrand(goal)
  const brandName = (goal.brandName || brand.name || '').replace(/ gift card$/i, '')
  const version = goalVersion(goal)
  const days = daysToYours(goal)
  const deposits = goal.deposits.filter((d) => !d.kind).length
  const saved = savedNim(goal) // the goal's saved NIM (withdrawals never add to it)
  const savedFiat = fmtFiatValue(saved, fiat, lang)
  const titleText = config.redeemMode === 'api' && !red ? t('done_paid') : t('done_title')

  // Copy helpers: the app clipboard helper, the app toast, a soft clink. The code never reaches the toast or a log.
  const copy = async (text, toastKey) => { if (text && (await copyText(text))) { toast(t(toastKey)); playClink() } }
  const toggleShow = () => { const next = !show; setShow(next); if (next) { setRevealN((n) => n + 1); playTing() } }

  // Gift: what the giver shares with the friend (note, the card, then the code). Share text only, with the app's copy
  // fallback. The code never reaches the Friends server; "Mark as sent" sends only the brand key and ids.
  const giftValue = `${brandName} ${detailText(t, goal, { short: true })}`.trim()
  const giftShareText = [note, giftValue, copyValue].filter(Boolean).join('\n')
  const sendGift = async () => {
    try { if (navigator.share) { await navigator.share({ text: giftShareText }); return } } catch { /* cancelled or unavailable */ }
    if (await copyText(giftShareText)) { toast(t('done_copied')); playClink() }
  }
  // A direct gift keeps one giftId on its tag, so a retried send is idempotent (the server keys the record by it).
  const ensureGiftId = () => { const g = giftOf(goalId); if (g?.giftId) return g.giftId; const id = newGiftId(); setGift(goalId, { giftId: id }); return id }
  // Create the server record for the gift (direct: a new record keyed by giftId; wishlist: the claim's "sent" route).
  const recordSent = async (msg) => {
    if (isDirect) await sendDirectGift(giftTag.friendId, { giftId: ensureGiftId(), brandKey: giftTag.brandKey, message: msg, banner })
    else await sendSent(giftTag.friendId, giftTag.brandKey, { message: msg, banner })
    markGiftSent(goalId, { message: msg, banner })
  }

  const doMarkSent = async () => {
    const msg = note.trim()
    if (giftMessageError(msg)) { setLinkErr(true); return } // a link in the message: send nothing, say why
    setLinkErr(false); setSending(true); setSentErr(false)
    try { await recordSent(msg); setSentState(true) }
    catch { setSentErr(true) } finally { setSending(false) }
  }

  // Send in Dibs: mark the gift sent (if not yet), seal the redemption for each of the friend's devices, and deliver the
  // boxes. The code is sealed on this phone (lib/giftBox.js) and only the friend's phone can open it. On failure nothing
  // is marked delivered; the share sheet stays as the fallback.
  const meId = friendsState()?.id || ''
  const doSendInDibs = async () => {
    const msg = note.trim()
    if (giftMessageError(msg)) { setLinkErr(true); return }
    const keys = recipientKeys || []
    if (!keys.length) return // the button is disabled in this case; guard anyway
    setLinkErr(false); setSending(true)
    try {
      if (!sentState) { await recordSent(msg); setSentState(true) }
      const aad = `${giftTag.friendId}:${giftTag.brandKey}:${meId}`
      const boxes = []
      for (const k of keys) boxes.push(await seal(red, k, aad))
      if (isDirect) await deliverDirectGift(giftTag.friendId, ensureGiftId(), boxes)
      else await deliverGift(giftTag.friendId, giftTag.brandKey, boxes)
      markDelivered(goalId); setDelivered(true)
    } catch { toast(t('frd_save_fail')) } finally { setSending(false) }
  }

  // Keep it for me (v1.7.4): drop the direct tag before it is sent, so the Send card goes away. No server call.
  const keepIt = () => { clearGift(goalId); toast(t('og_kept')); setTagTick((n) => n + 1) }
  // The picker tagged this bought card: show the Send card with its defaults and scroll to it.
  const onPickerTagged = () => {
    setPickerOpen(false)
    setNote(t('frd_gift_note_default', { me: meName })); setBanner('none'); setSentState(false); setDelivered(false)
    setTagTick((n) => n + 1)
    setTimeout(() => sendRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  const hash = goal.payment?.hash || null
  const swapId = goal.payment?.swapId || null

  const noteParts = t('done_note').split('{link}')

  return (
    <>
      <Header />
      <main className={`screen done-screen${enter ? ' done-enter' : ''}`}>
        <div className="done-hero">
          <div className="done-stamp-wrap">
            <div className="done-confetti" aria-hidden="true">{CONFETTI.map((c) => <i key={c} className={`cf ${c}`} />)}</div>
            <b className="done-stamp">Dibs!</b>
          </div>
          <h1 className="done-title">{titleText}</h1>
          {red && <p className="done-story">{t(days === 1 ? 'done_story_one' : 'done_story_other', { item: itemLabel(t, goal), count: days })}</p>}
        </div>

        <section className="ticket">
          <div className="bs-card tk-card" style={{ background: brandGrad(brand.key) }}>
            <i className="gift-sheen" aria-hidden="true" />
            <div className="bs-card-top">
              <BrandLogo brand={brand} />
              <span className="bs-card-kind">{t('bs_gift')}</span>
            </div>
            <div className="bs-card-bot">
              <b>{brandName}</b>
              <span>{detailText(t, goal)} · {t(`region_${version.region}`)}</span>
            </div>
          </div>
          <div className="tk-tear" aria-hidden="true" />
          <div className="tk-body">
            {config.redeemMode !== 'api' ? (
              <p className="tk-manual">{t('done_manual')}</p>
            ) : !red ? (
              <>
                <div className="tk-wait">
                  <span className="tk-spin" aria-hidden="true" />
                  <div><b>{t('done_waiting')}</b><p className="tk-step">{t(`done_s${stepIdx}`)}</p></div>
                </div>
                <DidYouKnow list="C" />
              </>
            ) : (
              <>
                {hasCode && (
                  <>
                    <div className="tk-head">
                      <span className="tk-label">{t('done_code')}</span>
                      {code && <button type="button" className="tk-eye" aria-label={show ? t('done_hide') : t('done_show')} onClick={toggleShow}><EyeIcon off={show} /></button>}
                    </div>
                    {code && (
                      <button type="button" className={`tk-code${show ? ' on' : ''}`} key={`c${revealN}`} aria-label={t('done_copy')} onClick={() => copy(code, 'done_copied')}>
                        {show ? (reduced ? code : <RevealChars text={code} />) : '•••• •••• ••••'}
                      </button>
                    )}
                    {pin && (
                      <>
                        <span className="tk-label tk-label-pin">{pinLabel}</span>
                        <button type="button" className={`tk-code${show ? ' on' : ''}`} key={`p${revealN}`} aria-label={t('done_pin')} onClick={() => copy(pin, 'done_pin_copied')}>
                          {show ? (reduced ? pin : <RevealChars text={pin} />) : '••••'}
                        </button>
                      </>
                    )}
                  </>
                )}
                {link && !safeLink && <p className="tk-rawlink">{link}</p>}
                {/* v1.6.0 in-store cards (SLOT, Samsung MGS): where the code works. */}
                {brand.delivers === 'instore' && <p className="tk-instore">{t('instore_how', { store: brand.store || brandName })}</p>}
                <div className="tk-acts">
                  {hasCode && <button type="button" className="btn gold tk-btn" onClick={() => copy(copyValue, 'done_copied')}>{t('done_copy')}</button>}
                  {safeLink && <a className={`btn tk-btn ${hasCode ? 'ghost' : 'gold'}`} href={safeLink} target="_blank" rel="noopener noreferrer">{t('done_open_link')}</a>}
                  {!hasCode && safeLink && <button type="button" className="btn ghost tk-btn" onClick={() => copy(copyValue, 'done_copied')}>{t('done_copy')}</button>}
                  {!hasCode && link && !safeLink && <button type="button" className="btn gold tk-btn" onClick={() => copy(copyValue, 'done_copied')}>{t('done_copy')}</button>}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Already bought, not a gift yet (v1.7.4): offer to gift the card, from History details, when Friends is on. */}
        {!giftTag && final && red && mode === 'details' && friendsState()?.on && (
          <button type="button" className="card og-offer" onClick={() => setPickerOpen(true)}>
            <span className="si gift og-offer-ic" aria-hidden="true"><GiftGlyph /></span>
            <span className="og-offer-mid"><b>{t('og_entry')}</b><small>{t('og_entry_sub')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        )}

        {giftTag && final && (
          <section className="card gift-send" ref={sendRef}>
            <div className="gift-send-head">
              <h3>{t('frd_gift_send_title', { name: giftTag.name })}</h3>
              {isDirect && !sentState && (
                <button type="button" className="txt-link gift-keep-link" onClick={keepIt}>{t('og_keep')}</button>
              )}
            </div>

            <div className="gift-row-head">
              <span className="small">{t('frd_gift_banner_label')}</span>
              <span className="gift-head-hint">{t('frd_gift_banner_hint', { name: giftTag.name })}</span>
            </div>
            <div className="gift-pick" role="radiogroup" aria-label={t('frd_gift_banner_label')}>
              {GIFT_BANNERS.map((b) => (
                <button type="button" key={b} role="radio" aria-checked={banner === b} aria-label={t(`frd_banner_${b}`)}
                  className={`gift-pick-tile${banner === b ? ' on' : ''}`} disabled={sentState} onClick={() => pickBanner(b)}>
                  <GiftBanner banner={b} thumb />
                </button>
              ))}
              <button type="button" role="radio" aria-checked={banner === 'none'}
                className={`gift-pick-tile gift-pick-none${banner === 'none' ? ' on' : ''}`} disabled={sentState} onClick={() => pickBanner('none')}>
                {t('frd_gift_banner_none')}
              </button>
            </div>

            {/* Level banners (lib/giftBanners.js): seven the sender unlocks by level. Looks only. Picking one deselects
                the free row (the single `banner` value). A locked tap shows one line and selects nothing. */}
            <div className="gift-row-head">
              <span className="small">{t('gb_by_level')}</span>
              <span className="gift-head-hint">{t('gb_you_level', { n: level })}</span>
            </div>
            <div className="gift-pick gift-pick-lv" role="radiogroup" aria-label={t('gb_by_level')}>
              {LEVEL_BANNERS.map((b) => {
                const unlocked = bannerUnlocked(b.id, level)
                return (
                  <button type="button" key={b.id} role="radio" aria-checked={banner === b.id} aria-label={t(b.line)}
                    aria-disabled={!unlocked || undefined} disabled={sentState}
                    className={`gift-pick-tile gift-lv-tile${banner === b.id ? ' on' : ''}${unlocked ? '' : ' locked'}`}
                    onClick={() => (unlocked ? pickBanner(b.id) : setLockMsg(b.level))}>
                    <GiftBanner banner={b.id} thumb />
                    {!unlocked && <span className="gift-lv-lock" aria-hidden="true"><LockGlyph /></span>}
                    <span className="gift-lv-cap">{t('gb_lv', { n: b.level })}</span>
                  </button>
                )
              })}
            </div>
            {lockMsg != null && <p className="gift-locked-line"><LockGlyph />{t('gb_locked_at', { n: lockMsg })}</p>}

            <div className="gift-row-head">
              <label className="small" htmlFor="gift-note">{t('frd_gift_msg_label')}</label>
              <span className="gift-count">{t('frd_gift_msg_count', { n: [...note].length })}</span>
            </div>
            <textarea id="gift-note" className="gift-note" maxLength={140} rows={2} value={note} readOnly={sentState}
              onChange={(e) => { setNote(e.target.value); setLinkErr(false) }} />
            <p className="frd-note">{t('frd_gift_msg_help', { name: giftTag.name })}</p>

            <p className="small gift-pre-label">{t('frd_gift_code_hint')}</p>
            <div className="gift-preview">
              {banner !== 'none' && <GiftBanner banner={banner} />}
              {note && <p className="gift-pre-note">{note}</p>}
              <p className="gift-pre-card">{giftValue}</p>
              {(hasCode || link) && <p className="gift-pre-code">{show ? copyValue : '•••• •••• ••••'}</p>}
            </div>
            {red && (
              <>
                <button type="button" className="btn gold gift-send-dibs"
                  disabled={sending || delivered || recipientKeys === null || (recipientKeys && recipientKeys.length === 0)}
                  onClick={doSendInDibs}>{t('frd_gift_send_dibs')}</button>
                <p className="frd-note">
                  {delivered
                    ? (openedAt ? t('frd_gift_opened_on', { date: fmtDate(openedAt, lang) }) : t('frd_gift_delivered_wait', { name: giftTag.name }))
                    : (recipientKeys && recipientKeys.length === 0 ? t('frd_gift_no_key', { name: giftTag.name }) : t('frd_gift_locked_only', { name: giftTag.name }))}
                </p>
              </>
            )}
            <button type="button" className={`btn ${red ? 'ghost' : 'gold'}`} onClick={sendGift}>{t('frd_gift_share')}</button>
            <p className="frd-note">{t('frd_gift_share_note')}</p>
            {sentState
              ? <p className="gift-sent-ok">{t('frd_gift_marked_sent')}{giftTag.thanked ? ` · ${t('frd_gift_thanks', { name: giftTag.name })}` : ''}</p>
              : <button type="button" className="btn ghost" disabled={sending} onClick={doMarkSent}>{t('frd_gift_mark_sent')}</button>}
            {linkErr && <p className="frd-quiet gift-link-err">{t('frd_gift_link_refused')}</p>}
            {sentErr && <p className="frd-quiet">{t('frd_save_fail')}</p>}
          </section>
        )}

        {red && (
          <div className="done-stats">
            <div className="done-stat"><b>{days}</b><span>{t(days === 1 ? 'done_stat_days_sub_one' : 'done_stat_days_sub')}</span></div>
            <div className="done-stat"><b>{deposits}</b><span>{t(deposits === 1 ? 'done_stat_deposits_one' : 'done_stat_deposits')}</span></div>
            <div className="done-stat"><b>{fmtNim(saved, lang)}</b><span>{t('done_stat_saved')}</span>{savedFiat && <small>{savedFiat}</small>}</div>
          </div>
        )}

        {red && (
          <p className="done-note">
            <Icon name="info" size={18} />
            <span>{noteParts[0]}<button type="button" className="done-note-link" onClick={() => go('history', { focus: 'cards' })}>{t('tab_history')}</button>{noteParts[1]}</span>
          </p>
        )}

        {hash && (
          <div className="done-ref">
            <div className="done-ref-row">
              <button type="button" className="done-ref-open" onClick={() => swapId && setRefOpen((o) => !o)} aria-expanded={swapId ? refOpen : undefined}>
                <span className="done-ref-lab">{t('done_ref')}</span>
                <span className="chip done-ref-chip">{shortHash(hash)}</span>
              </button>
              <button type="button" className="done-ref-copy" onClick={() => copy(hash, 'done_ref_copied')}>{t('done_ref_copy')}</button>
            </div>
            {refOpen && swapId && (
              <button type="button" className="done-swap" onClick={() => copy(swapId, 'done_ref_copied')}>
                <span className="done-ref-lab">{t('done_swap')}</span>
                <span className="chip done-ref-chip">{swapId}</span>
              </button>
            )}
          </div>
        )}

        <div className="bottom done-bottom">
          <button type="button" className="btn ghost done-home" onClick={() => reset('home')}>
            <Icon name="tabGoals" size={22} /><span>{t('done_home')}</span>
          </button>
          <button type="button" className="done-new" onClick={() => reset('catalog')}>
            <span className="done-new-plus" aria-hidden="true">+</span>
            <span className="done-new-txt"><b>{t('done_new')}</b><small>{t('home_new2_sub')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        </div>
      </main>
      {pickerOpen && <GiftPickerSheet goal={goal} onClose={() => setPickerOpen(false)} onTagged={onPickerTagged} />}
    </>
  )
}
