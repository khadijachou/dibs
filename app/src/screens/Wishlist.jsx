// The wishlist (Profile > Wishlist): one row per hearted brand, a tap opens the brand the way the catalog does.
// Works with Friends off and with no Friends server. Shared to friends only through the existing sync.
// v1.4.3: gifts received. A friend who called dibs on a wish and marked it sent shows here as "Gifted, from {name}"
// with a "Say thanks" button. No amounts, no code: the code arrived by the giver's own message, outside Dibs.
// v1.7.1: a gift that carries a message or a banner becomes a card at the top (banner, message, brand row, Say thanks),
// with a privacy note under the list. A gift with neither stays the plain inline row, exactly as before.
import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Icon, BrandLogo } from '../components/ui.jsx'
import BrandSheet from '../components/BrandSheet.jsx'
import GiftBanner from '../components/GiftBanner.jsx'
import { brandByKey, useWishlist } from '../components/FriendsParts.jsx'
import { toggle as toggleWish } from '../lib/wishlist.js'
import { enabled as friendsEnabled, isOn as friendsIsOn, getVis as friendsVis, syncQuiet, me as loadMe } from '../lib/friends.js'
import { sayThanks, sayThanksDirect, getGiftIn } from '../lib/gifts.js'
import { copyText } from '../lib/clipboard.js'
import { listGoals } from '../lib/goals.js'
import { markDailyOpen } from '../lib/quests.js'

// Show code (v1.7.3): for a gift the receiver opened in Dibs, the redemption is kept on this phone (lib/gifts.js
// dibs.giftsIn). A quiet "Show code" link reveals it again (the server has deleted its copy). No link: nothing shows.
function GiftCodeLink({ gift }) {
  const { t, toast } = useApp()
  const red = getGiftIn(gift)
  const [show, setShow] = useState(false)
  if (!red) return null
  const copy = async (text, key) => { if (text && (await copyText(text))) toast(t(key)) }
  if (!show) return <button type="button" className="txt-link gift-show-code" onClick={() => setShow(true)}>{t('frd_gift_show_code')}</button>
  return (
    <div className="gift-code-reveal">
      <button type="button" className="tk-code on" aria-label={t('done_copy')} onClick={() => copy(red.code || red.link, 'done_copied')}>{red.code || red.link}</button>
      {red.pin && (
        <>
          <span className="tk-label tk-label-pin">{t('done_pin')}</span>
          <button type="button" className="tk-code on" aria-label={t('done_pin')} onClick={() => copy(red.pin, 'done_pin_copied')}>{red.pin}</button>
        </>
      )}
    </div>
  )
}

// A received gift (state sent on the server): a mint pill, "Got it, from {name}", and Say thanks -> Thanks sent.
function ReceivedGift({ gift }) {
  const { t } = useApp()
  const name = gift.from?.name || ''
  const [thanked, setThanked] = useState(Boolean(gift.thanked))
  const [busy, setBusy] = useState(false)
  const say = async () => {
    setBusy(true)
    try { await (gift.kind === 'direct' ? sayThanksDirect(gift.giftId) : sayThanks(gift.brandKey)); setThanked(true) } catch { /* leave as is: the user can try again */ } finally { setBusy(false) }
  }
  return (
    <div className="frd-gift-got">
      <span className="frd-pill frd-pill-mint">{t('frd_gift_gifted')}</span>
      <small className="frd-gift-got-line">{t('frd_gift_got', { name })}</small>
      {thanked
        ? <span className="frd-gift-thx-done">{t('frd_gift_thanks_sent')}</span>
        : <button type="button" className="frd-gift-thx" disabled={busy} onClick={say}>{t('frd_gift_say_thanks', { name })}</button>}
      <GiftCodeLink gift={gift} />
    </div>
  )
}

// A received gift that carries a message or a banner (v1.7.1): a card with the banner, the message, a brand row
// ("From {name}" and the "Gifted" pill) and "Say thanks to {name}". Message with banner None: no banner strip. Banner
// without message: just the banner and the brand row.
function ReceivedGiftCard({ gift }) {
  const { t } = useApp()
  const name = gift.from?.name || ''
  const b = brandByKey(gift.brandKey)
  const [thanked, setThanked] = useState(Boolean(gift.thanked))
  const [busy, setBusy] = useState(false)
  const say = async () => {
    setBusy(true)
    try { await (gift.kind === 'direct' ? sayThanksDirect(gift.giftId) : sayThanks(gift.brandKey)); setThanked(true) } catch { /* leave as is: the user can try again */ } finally { setBusy(false) }
  }
  return (
    <section className="card gift-card">
      {gift.banner && <GiftBanner banner={gift.banner} />}
      {gift.message && <p className="gift-card-msg">{gift.message}</p>}
      <div className="gift-card-row">
        {b && <BrandLogo brand={b} className="frd-brand-logo" />}
        <span className="frd-row-mid"><b>{b?.name || gift.brandKey}</b><small>{t('frd_gift_from', { name })}</small></span>
        <span className="frd-pill frd-pill-mint">{t('frd_gift_gifted')}</span>
      </div>
      {thanked
        ? <span className="frd-gift-thx-done gift-card-thx">{t('frd_gift_thanks_sent')}</span>
        : <button type="button" className="btn ghost gift-card-thx" disabled={busy} onClick={say}>{t('frd_gift_say_thanks', { name })}</button>}
      <GiftCodeLink gift={gift} />
    </section>
  )
}

export default function Wishlist() {
  const { t, go, back, address } = useApp()
  const keys = useWishlist()
  const [open, setOpen] = useState(null) // brand key whose sheet is open
  const [gifts, setGifts] = useState([]) // received gifts (state sent) from GET /v1/me
  const brands = keys.map(brandByKey).filter(Boolean)
  const shared = friendsIsOn() && ['friends', 'everyone'].includes(friendsVis().wishlist)

  // Load received gifts once, only when Friends is on. On any failure the screen is exactly as today (no gifts).
  useEffect(() => {
    if (!friendsEnabled() || !friendsIsOn()) return undefined
    let live = true
    loadMe().then((r) => { if (live) setGifts(Array.isArray(r?.gifts) ? r.gifts : []) }).catch(() => { /* server unreachable: as today */ })
    return () => { live = false }
  }, [])
  // Direct gifts (v1.7.4) always show as cards at the top (they are not tied to my wishlist). Wishlist gifts with a
  // message or a banner also become cards; a plain wishlist gift stays an inline row on its hearted brand.
  const wishGifts = gifts.filter((g) => g.kind !== 'direct')
  const directGifts = gifts.filter((g) => g.kind === 'direct')
  const giftByBrand = Object.fromEntries(wishGifts.map((g) => [g.brandKey, g]))
  const richWish = wishGifts.filter((g) => g.message || g.banner)
  const richBrands = new Set(richWish.map((g) => g.brandKey))
  const listBrands = brands.filter((b) => !richBrands.has(b.key)) // the plain list (hearted brands minus the card ones)
  const extraGifts = wishGifts.filter((g) => !keys.includes(g.brandKey) && !richBrands.has(g.brandKey)) // plain gifts off my list
  const giftNoteName = richWish.find((g) => g.message)?.from?.name || ''

  const openBrand = (b) => { markDailyOpen({ k: 'brand', chip: b.chip }, listGoals(address)); setOpen(b.key) }
  const sheetBrand = brandByKey(open)
  const pick = (region, itemId) => { const brandKey = sheetBrand.key; setOpen(null); go('plan', { brandKey, region, itemId }) }
  const remove = (key) => {
    toggleWish(key)
    const v = friendsVis().wishlist
    if (friendsIsOn() && (v === 'friends' || v === 'everyone')) syncQuiet(address)
  }

  const footer = (
    <p className="frd-private frd-wl-foot">
      {t(shared ? 'frd_wl_foot_shared' : 'frd_wl_foot_only')}
      {friendsEnabled() && friendsIsOn() && (
        <>{' '}<button type="button" className="txt-link" onClick={() => go('friendProfile', { me: true })}>{t('frd_wl_change')}</button></>
      )}
    </p>
  )

  const isEmpty = listBrands.length === 0 && richWish.length === 0 && extraGifts.length === 0 && directGifts.length === 0

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <h2 className="title">{t('frd_item_wishlist')}</h2>

        {isEmpty ? (
          <>
            <section className="frd-empty">
              <span className="frd-empty-ic" aria-hidden="true"><Icon name="heart" size={28} /></span>
              <b>{t('frd_wl_empty_title')}</b>
              <p className="small">{t('frd_wl_empty_sub')}</p>
              <button type="button" className="btn" onClick={() => go('catalog')}>{t('frd_wl_browse')}</button>
            </section>
            {footer}
          </>
        ) : (
          <>
            {directGifts.map((g) => <ReceivedGiftCard key={g.giftId} gift={g} />)}
            {richWish.map((g) => <ReceivedGiftCard key={g.brandKey} gift={g} />)}
            {listBrands.length > 0 && (
              <section className="frd-sec">
                {listBrands.map((b) => {
                  const gift = giftByBrand[b.key]
                  return (
                    <div className="frd-row" key={b.key}>
                      <button type="button" className="frd-row-open" onClick={() => openBrand(b)}>
                        <BrandLogo brand={b} className="frd-brand-logo" />
                        <span className="frd-row-mid"><b>{b.name}</b><small>{t('ob_gift')}</small></span>
                      </button>
                      {gift ? <ReceivedGift gift={gift} /> : (
                        <button type="button" className="frd-wl-remove" aria-pressed="true"
                          aria-label={t('frd_wl_remove', { brand: b.name })} onClick={() => remove(b.key)}>
                          <span className="gtile-heart-ic" aria-hidden="true"><Icon name="heartFilled" size={18} /></span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </section>
            )}
            {extraGifts.length > 0 && (
              <section className="frd-sec">
                {extraGifts.map((g) => {
                  const b = brandByKey(g.brandKey)
                  return (
                    <div className="frd-row" key={g.brandKey}>
                      {b && <BrandLogo brand={b} className="frd-brand-logo" />}
                      <span className="frd-row-mid"><b>{b?.name || g.brandKey}</b><small>{t('ob_gift')}</small></span>
                      <ReceivedGift gift={g} />
                    </div>
                  )
                })}
              </section>
            )}
            {richWish.some((g) => g.message) && <p className="frd-private frd-wl-foot gift-note-line">{t('frd_gift_msg_note', { name: giftNoteName })}</p>}
            {footer}
          </>
        )}
      </main>
      {sheetBrand && <BrandSheet brand={sheetBrand} onClose={() => setOpen(null)} onPick={pick} />}
    </>
  )
}
