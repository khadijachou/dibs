import { useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Sheet } from './ui.jsx'
import { brandGrad, brandRegion, defaultRegion, worksLine } from '../lib/brands.js'
import { getPref } from '../lib/prefs.js'
import { copyText } from '../lib/clipboard.js'
import { HELP_EMAIL } from './LegalText.jsx'
import { detailText } from '../lib/itemName.js'
import { fmtNim } from '../lib/format.js'
import { usdToNim } from '../lib/price.js'

// Brand sheet (catalogue tiles, Home "Call dibs on something else"): the card as a big gift card, what it is, where it
// works, how the shop delivers it, and every value in the live catalogue with its rough NIM price.
// onPick(regionKey): the sticky "Call dibs on {brand}" button (starts the goal on the version shown); without it,
// Close is the only action.
// Versions (USA, Europe, UK, Nigeria): with more than one, the Region fact becomes chips; a chip swaps the range, the
// values, their NIM and the count. It only changes what is shown: the version is saved when the user calls dibs
// (lib/prefs.js), or in More > Your accounts. With several versions and none saved, "My region isn't here" opens a
// sheet with the help email.
// pref: Your accounts' version step (card face, chips, works-with line; no values). onSave(versionKey) saves it;
// onRemove (a brand already saved) removes it.
export default function BrandSheet({ brand, onClose, onPick, pref = false, onSave, onRemove }) {
  const { t, lang, toast, prices } = useApp()
  const regions = brand.regions || []
  const [regionKey, setRegionKey] = useState(() => defaultRegion(brand)?.key || null)
  const [missing, setMissing] = useState(false)
  const saved = getPref(brand.key)
  const version = brandRegion(brand, regionKey)
  const items = version?.items || brand.items || []
  const pickRegion = (key) => setRegionKey(key)
  const regionLink = regions.length > 1 && !saved
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
      <div className={`bs-facts${regions.length > 1 ? ' versions' : ''}`}>
        {regions.length > 1 ? (
          <div className="bs-region">
            <span>{t('about_region')}</span>
            <div className="pills bs-region-pills" role="group" aria-label={t('about_region')}>
              {regions.map((r) => (
                <button type="button" key={r.key} className={`pill${r.key === version?.key ? ' on' : ''}`} aria-pressed={r.key === version?.key} onClick={() => pickRegion(r.key)}>
                  {t(`region_${r.key}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div><span>{t('about_region')}</span><b>{version ? t(`region_${version.key}`) : '-'}</b></div>
        )}
        {!pref && <div><span>{t('about_delivered')}</span><b>{brand.delivers ? t(`delivers_${brand.delivers}`) : '-'}</b></div>}
        {!pref && <div><span>{t('bs_values')}</span><b>{items.length}</b></div>}
      </div>
      {regionLink && <button type="button" className="region-link" onClick={() => setMissing(true)}>{t('region_missing_link')}</button>}
      {!pref && items.length > 0 && (
        <div className="bs-vals">
          <span className="small sheet-label">{t('plan_card_value')}</span>
          <div className="bs-val-grid">
            {items.map((it) => (
              <div className="bs-val" key={it.id}>
                <b>{detailText(t, it, { short: true })}</b>
                {prices && it.usd != null && (
                  <span className={it.live === false ? 'est' : undefined}>
                    {t('bs_nim', { nim: fmtNim(usdToNim(it.usd, prices.nimUsd), lang) })}
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
      {version?.worksWith && <p className="small works-line">{worksLine(t, version.worksWith)}</p>}
      {!pref && (
        <p className="bs-how">
          <i aria-hidden="true" />
          <span>{brand.delivers && <>{t(`bs_how_${brand.delivers}`)} </>}{t('bs_prices')}</span>
        </p>
      )}
      {pref ? (
        <div className="bs-acts">
          <button type="button" className="btn tall" disabled={!version} onClick={() => onSave?.(version.key)}>
            {t(saved ? 'pref_save_cta' : 'pref_add_cta')}<small>{t('pref_cta_sub', { brand: brand.name, version: version ? t(`region_${version.key}`) : '' })}</small>
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>{t('manage_cancel')}</button>
          {saved && onRemove && <button type="button" className="btn-text-danger" onClick={onRemove}>{t('pref_remove')}</button>}
        </div>
      ) : (
      <div className="bs-acts">
        {onPick && (
          <button type="button" className="btn tall" onClick={() => onPick(version?.key || null)}>
            {t('cat_cta', { brand: brand.name })}<small>{t('cat_cta_sub')}</small>
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onClose}>{t('ob_close')}</button>
      </div>
      )}
      {missing && <RegionMissingSheet onClose={() => setMissing(false)} />}
    </Sheet>
  )
}

// "Your region isn't here?": the help email (copied on tap, like Need help). As a sheet (brand sheet link) or a card
// (Your accounts).
export function RegionMissing({ card = false }) {
  const { t, toast } = useApp()
  const copyEmail = async () => { if (await copyText(HELP_EMAIL)) toast(t('help_copied')) }
  const body = (
    <>
      <p className={card ? undefined : 'small'}>{t('region_missing_body')}</p>
      <button type="button" className="help-email" aria-label={t('help_email')} onClick={copyEmail}>{HELP_EMAIL}</button>
    </>
  )
  return card ? <section className="help-card region-card"><h3>{t('region_missing_title')}</h3>{body}</section> : body
}

export function RegionMissingSheet({ onClose }) {
  const { t } = useApp()
  return (
    <Sheet title={t('region_missing_title')} onClose={onClose}>
      <div className="region-card"><RegionMissing /></div>
      <button type="button" className="btn ghost" onClick={onClose}>{t('ob_close')}</button>
    </Sheet>
  )
}
