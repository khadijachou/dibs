import { useApp } from '../App.jsx'
import { BrandLogo, Sheet } from './ui.jsx'
import { brandGrad, regionText } from '../lib/brands.js'
import { detailText } from '../lib/itemName.js'
import { fmtNim } from '../lib/format.js'
import { usdToNim } from '../lib/price.js'

// Brand sheet (catalogue tiles, Home "Call dibs on something else"): the card as a big gift card, what it is, where it
// works, how the shop delivers it, and every value in the live catalogue with its rough NIM price.
// onPick: the sticky "Call dibs on {brand}" button (starts the goal); without it, Close is the only action.
export default function BrandSheet({ brand, onClose, onPick }) {
  const { t, lang, toast, prices } = useApp()
  const region = regionText(t, brand)
  const items = brand.items || []
  const lo = items[0]
  const hi = items[items.length - 1]
  const range = !lo ? '' : items.length > 1
    ? t('bs_range', { lo: detailText(t, lo, { short: true }), hi: detailText(t, hi, { short: true }) })
    : detailText(t, lo, { short: true })
  const estimated = items.some((it) => it.live === false)
  return (
    <Sheet label={brand.name} onClose={onClose}>
      <div className="bs-card" style={{ background: brandGrad(brand.key) }}>
        <i className="gift-sheen" aria-hidden="true" />
        <div className="bs-card-top">
          <BrandLogo brand={brand} />
          <span className="bs-card-kind">{t('bs_gift')}</span>
        </div>
        <div className="bs-card-bot">
          <b>{brand.name}</b>
          {range && <span>{range}</span>}
        </div>
      </div>
      {brand.about && <p className="bs-lead">{t(brand.about)}</p>}
      <div className="bs-facts">
        <div><span>{t('about_region')}</span><b>{region || '-'}</b></div>
        <div><span>{t('about_delivered')}</span><b>{brand.delivers ? t(`delivers_${brand.delivers}`) : '-'}</b></div>
        <div><span>{t('bs_values')}</span><b>{items.length}</b></div>
      </div>
      {items.length > 0 && (
        <div className="bs-vals">
          <span className="small sheet-label">{t('plan_card_value')}</span>
          <div className="bs-val-grid">
            {items.map((it) => (
              <div className="bs-val" key={it.id}>
                <b>{detailText(t, it, { short: true })}</b>
                {prices && it.usd != null && (
                  <span className={it.live === false ? 'est' : undefined}>
                    {it.live === false ? '≈ ' : ''}{t('bs_nim', { nim: fmtNim(usdToNim(it.usd, prices.nimUsd), lang) })}
                  </span>
                )}
              </div>
            ))}
          </div>
          {estimated && (
            <button type="button" className="price-chip" onClick={() => toast(t('price_checkout_info'))}>
              <i aria-hidden="true">i</i>{t('price_chip')}
            </button>
          )}
        </div>
      )}
      <p className="bs-how">
        <i aria-hidden="true" />
        <span>{brand.delivers && <>{t(`bs_how_${brand.delivers}`)} </>}{t('bs_prices')}</span>
      </p>
      <div className="bs-acts">
        {onPick && (
          <button type="button" className="btn tall" onClick={onPick}>
            {t('cat_cta', { brand: brand.name })}<small>{t('cat_cta_sub')}</small>
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onClose}>{t('ob_close')}</button>
      </div>
    </Sheet>
  )
}
