// The wishlist (Profile > Wishlist): one row per hearted brand, a tap opens the brand the way the catalog does.
// Works with Friends off and with no Friends server. Shared to friends only through the existing sync.
// v1.4.3: gifts received. A friend who called dibs on a wish and marked it sent shows here as "Gifted, from {name}"
// with a "Say thanks" button. No amounts, no code: the code arrived by the giver's own message, outside Dibs.
import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Icon, BrandLogo } from '../components/ui.jsx'
import BrandSheet from '../components/BrandSheet.jsx'
import { brandByKey, useWishlist } from '../components/FriendsParts.jsx'
import { toggle as toggleWish } from '../lib/wishlist.js'
import { enabled as friendsEnabled, isOn as friendsIsOn, getVis as friendsVis, syncQuiet, me as loadMe } from '../lib/friends.js'
import { sayThanks } from '../lib/gifts.js'
import { listGoals } from '../lib/goals.js'
import { markDailyOpen } from '../lib/quests.js'

// A received gift (state sent on the server): a mint pill, "Got it, from {name}", and Say thanks -> Thanks sent.
function ReceivedGift({ gift }) {
  const { t } = useApp()
  const name = gift.from?.name || ''
  const [thanked, setThanked] = useState(Boolean(gift.thanked))
  const [busy, setBusy] = useState(false)
  const say = async () => {
    setBusy(true)
    try { await sayThanks(gift.brandKey); setThanked(true) } catch { /* leave as is: the user can try again */ } finally { setBusy(false) }
  }
  return (
    <div className="frd-gift-got">
      <span className="frd-pill frd-pill-mint">{t('frd_gift_gifted')}</span>
      <small className="frd-gift-got-line">{t('frd_gift_got', { name })}</small>
      {thanked
        ? <span className="frd-gift-thx-done">{t('frd_gift_thanks_sent')}</span>
        : <button type="button" className="frd-gift-thx" disabled={busy} onClick={say}>{t('frd_gift_say_thanks', { name })}</button>}
    </div>
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
  const giftByBrand = Object.fromEntries(gifts.map((g) => [g.brandKey, g]))
  const extraGifts = gifts.filter((g) => !keys.includes(g.brandKey)) // gifts whose brand is no longer on my list

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

  const giftsOnly = brands.length === 0 && extraGifts.length > 0

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <h2 className="title">{t('frd_item_wishlist')}</h2>

        {brands.length === 0 && !giftsOnly ? (
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
            {brands.length > 0 && (
              <section className="frd-sec">
                {brands.map((b) => {
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
            {footer}
          </>
        )}
      </main>
      {sheetBrand && <BrandSheet brand={sheetBrand} onClose={() => setOpen(null)} onPick={pick} />}
    </>
  )
}
