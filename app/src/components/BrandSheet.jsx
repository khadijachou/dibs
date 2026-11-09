import { useApp } from '../App.jsx'
import { BrandLogo, Sheet } from './ui.jsx'
import { regionText } from '../lib/brands.js'
import { detailText } from '../lib/itemName.js'
import { fmtUsd } from '../lib/format.js'

// Brand details (Browse rows, the "i" on Catalog tiles): what the card is, where it works, how the shop delivers it,
// and every value in the live catalogue with what the user pays (or "Price confirmed at checkout" when the shop gave
// no live price, same rule as the tiles). Read only: Close is the only action.
export default function BrandSheet({ brand, onClose }) {
  const { t, lang, toast } = useApp()
  const region = regionText(t, brand)
  return (
    <Sheet label={brand.name} onClose={onClose}>
      <div className="bs-head">
        <BrandLogo brand={brand} />
        <h3 className="sheet-title">{brand.name}</h3>
      </div>
      {brand.about && <p className="bs-about">{t(brand.about)}</p>}
      {(region || brand.delivers) && (
        <dl className="about-facts">
          {region && <div><dt>{t('about_region')}</dt><dd>{region}</dd></div>}
          {brand.delivers && <div><dt>{t('about_delivered')}</dt><dd>{t(`delivers_${brand.delivers}`)}</dd></div>}
        </dl>
      )}
      {brand.items?.length > 0 && (
        <div className="bs-values">
          <span className="small sheet-label">{t('plan_card_value')}</span>
          <ul>
            {brand.items.map((it) => (
              <li key={it.id}>
                <b>{detailText(t, it, { short: true })}</b>
                {it.live === false ? (
                  <button type="button" className="price-chip" onClick={() => toast(t('price_checkout_info'))}>
                    <i aria-hidden="true">i</i>{t('price_checkout')}
                  </button>
                ) : it.usd != null && <span>{t('brand_you_pay', { price: fmtUsd(it.usd, lang) })}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="small bs-note">{t('brand_prices_note')}</p>
      <button type="button" className="btn ghost" onClick={onClose}>{t('ob_close')}</button>
    </Sheet>
  )
}

