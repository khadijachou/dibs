// The wishlist (Profile > Wishlist): one row per hearted brand, a tap opens the brand the way the catalog does.
// Works with Friends off and with no Friends server. Shared to friends only through the existing sync.
import { useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Icon, BrandLogo } from '../components/ui.jsx'
import BrandSheet from '../components/BrandSheet.jsx'
import { brandByKey, useWishlist } from '../components/FriendsParts.jsx'
import { toggle as toggleWish } from '../lib/wishlist.js'
import { enabled as friendsEnabled, isOn as friendsIsOn, getVis as friendsVis, syncQuiet } from '../lib/friends.js'
import { listGoals } from '../lib/goals.js'
import { markDailyOpen } from '../lib/quests.js'

export default function Wishlist() {
  const { t, go, back, address } = useApp()
  const keys = useWishlist()
  const [open, setOpen] = useState(null) // brand key whose sheet is open
  const brands = keys.map(brandByKey).filter(Boolean)
  const shared = friendsIsOn() && ['friends', 'everyone'].includes(friendsVis().wishlist)

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

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <h2 className="title">{t('frd_item_wishlist')}</h2>

        {brands.length === 0 ? (
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
            <section className="frd-sec">
              {brands.map((b) => (
                <div className="frd-row" key={b.key}>
                  <button type="button" className="frd-row-open" onClick={() => openBrand(b)}>
                    <BrandLogo brand={b} className="frd-brand-logo" />
                    <span className="frd-row-mid"><b>{b.name}</b><small>{t('ob_gift')}</small></span>
                  </button>
                  <button type="button" className="frd-wl-remove" aria-pressed="true"
                    aria-label={t('frd_wl_remove', { brand: b.name })} onClick={() => remove(b.key)}>
                    <span className="gtile-heart-ic" aria-hidden="true"><Icon name="heartFilled" size={18} /></span>
                  </button>
                </div>
              ))}
            </section>
            {footer}
          </>
        )}
      </main>
      {sheetBrand && <BrandSheet brand={sheetBrand} onClose={() => setOpen(null)} onPick={pick} />}
    </>
  )
}
