import { useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Sheet } from './ui.jsx'
import { brandGrad, brandRegion, defaultRegion } from '../lib/brands.js'
import { getPref } from '../lib/prefs.js'
import { copyText } from '../lib/clipboard.js'
import { HELP_EMAIL } from './LegalText.jsx'
import { detailText } from '../lib/itemName.js'
import { fmtNim } from '../lib/format.js'
import { valueNim } from '../screens/planView.js'

// Outline globe: "My region isn't here" (top right of the Region card, on every brand).
const GlobeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
  </svg>
)

// Brand sheet (catalogue tiles, Home "Call dibs on something else"): the card as a big gift card, what it is, the
// Region card and the Card values card, then how the shop delivers it.
// v1.1.8: the value is picked here. Each value shows its NIM, exactly the plan target (screens/planView.js valueNim:
// lib/readyState.js targetUsdOf, then lib/price.js usdToNim). The first value is selected; a region chip resets it.
// onPick(regionKey, itemId): the sticky "Call dibs on {brand}" button (Plan opens on that value); without it, Close is
// the only action.
// Versions (USA, Europe, UK, Nigeria): with more than one, the Region card shows chips; a chip only changes what is
// shown: the version is saved when the user calls dibs (lib/prefs.js), or in More > Your accounts. The globe (every
// brand) opens a sheet with the help email.
// pref: Your accounts' version step (card face, Region card; no values, no delivery line, as before). onSave(versionKey)
// saves it; onRemove (a brand already saved) removes it.
export default function BrandSheet({ brand, onClose, onPick, pref = false, onSave, onRemove }) {
  const { t, lang, toast, prices } = useApp()
  const regions = brand.regions || []
  const [regionKey, setRegionKey] = useState(() => defaultRegion(brand)?.key || null)
  const [valueId, setValueId] = useState(null) // null = the first value of the region
  const [missing, setMissing] = useState(false)
  const saved = getPref(brand.key)
  const version = brandRegion(brand, regionKey)
  const items = version?.items || brand.items || []
  const picked = items.find((it) => it.id === valueId) || items[0] || null
  const pickRegion = (key) => { setRegionKey(key); setValueId(null) }
  const lo = items[0]
  const hi = items[items.length - 1]
  const range = !lo ? '' : items.length > 1
    ? t('bs_range', { lo: detailText(t, lo, { short: true }), hi: detailText(t, hi, { short: true }) })
    : detailText(t, lo, { short: true })
  const estimated = items.some((it) => it.live === false)
  const valuesTitle = t(items.length > 1 ? 'bs_values_title' : 'bs_value_title')
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
      <section className="bs-box">
        <div className="bs-box-head">
          <span>{t('about_region')}</span>
          <button type="button" className="bs-globe" aria-label={t('region_missing_link')} onClick={() => setMissing(true)}><GlobeIcon /></button>
        </div>
        {regions.length > 1 ? (
          <div className="pills bs-region-pills" role="group" aria-label={t('about_region')}>
            {regions.map((r) => (
              <button type="button" key={r.key} className={`pill${r.key === version?.key ? ' on' : ''}`} aria-pressed={r.key === version?.key} onClick={() => pickRegion(r.key)}>
                {t(`region_${r.key}`)}
              </button>
            ))}
          </div>
        ) : (
          <b className="bs-box-val">{version ? t(`region_${version.key}`) : '-'}</b>
        )}
      </section>
      {!pref && items.length > 0 && (
        <section className="bs-box">
          <div className="bs-box-head">
            <span>{valuesTitle}</span>
            {brand.delivers && <span className="bs-deliv">{t('about_delivered')} <b>{t(`delivers_${brand.delivers}`)}</b></span>}
          </div>
          <div className="bs-val-pills" role="group" aria-label={valuesTitle}>
            {items.map((it) => {
              const nim = prices ? valueNim(it, prices.nimUsd) : null
              const on = it.id === picked?.id
              return (
                <button type="button" key={it.id} className={`pill bs-vpill${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setValueId(it.id)}>
                  <b>{detailText(t, it, { short: true })}</b>
                  {nim != null && <small>{t('bs_nim', { nim: fmtNim(nim, lang) })}</small>}
                </button>
              )
            })}
          </div>
          {estimated && (
            <button type="button" className="bs-est" onClick={() => toast(t('price_checkout_info'))}>
              <i aria-hidden="true">i</i>{t('price_chip')}
            </button>
          )}
        </section>
      )}
      {!pref && brand.delivers && (
        <p className="bs-how">
          <i aria-hidden="true" />
          <span>{t(brand.delivers === 'link' ? 'bs_how_link2' : `bs_how_${brand.delivers}`)}</span>
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
          <button type="button" className="btn tall" onClick={() => onPick(version?.key || null, picked?.id || null)}>
            {t('cat_cta', { brand: brand.name })}{picked && <small>{t('bs_cta_sub', { value: detailText(t, picked, { short: true }) })}</small>}
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
