import { useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header } from '../components/ui.jsx'
import BrandSheet from '../components/BrandSheet.jsx'
import { CHIPS, catalogBrands, regionText } from '../lib/brands.js'
import { fromText } from '../lib/itemName.js'
import { useReducedMotion } from '../components/UnlockTimer.jsx'
import { useChipSlide } from './Catalog.jsx'

// More > Browse the catalogue: every brand Dibs sells, read only. Same brands, chips and prices as the creation
// catalogue (lib/brands.js catalogBrands over the live catalogue). A row opens the brand sheet; there is no selection
// and no way to start a goal from here (that stays on the Goals tab).
export default function Browse() {
  const { t, back, canGoBack } = useApp()
  const reduced = useReducedMotion()
  const brands = catalogBrands()
  const [chip, setChip] = useState('all')
  const [open, setOpen] = useState(null) // brand key whose sheet is open
  const shown = chip === 'all' ? brands : brands.filter((b) => b.chip === chip)
  const usedChips = CHIPS.filter((c) => brands.some((b) => b.chip === c))
  const slide = useChipSlide(chip, reduced)
  const pickChip = (c) => { if (c === chip) return; slide.remember(); setChip(c) }
  const chipBtn = (c, label) => (
    <button type="button" key={c} className={`cat${chip === c ? ' on' : ''}`} aria-pressed={chip === c} onClick={() => pickChip(c)}>
      {chip === c && <i className="cat-hl" ref={slide.hl} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  )
  const sheetBrand = brands.find((b) => b.key === open)

  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <div>
          <h2 className="title">{t('browse_title')}</h2>
          <p className="sub" style={{ marginTop: 6 }}>{t('browse_sub', { count: brands.length })}</p>
        </div>
        <div className="cats hl" role="group">
          {chipBtn('all', t('chip_all', { count: brands.length }))}
          {usedChips.map((c) => chipBtn(c, t('chip_' + c)))}
        </div>
        <div className="browse-list">
          {shown.map((b) => {
            const region = regionText(t, b)
            return (
              <button type="button" key={b.key} className="sheet-row browse-row" aria-haspopup="dialog" onClick={() => setOpen(b.key)}>
                <BrandLogo brand={b} />
                <span>
                  <b>{b.name}</b>
                  <small>{fromText(t, b)}</small>
                  {(b.delivers || region) && (
                    <span className="browse-meta">
                      {b.delivers && <span className="dlv-badge">{t(`delivers_${b.delivers}`)}</span>}
                      {region && <span className="browse-region">{region}</span>}
                    </span>
                  )}
                </span>
                <span className="chev" aria-hidden="true">›</span>
              </button>
            )
          })}
        </div>
      </main>
      {sheetBrand && <BrandSheet brand={sheetBrand} onClose={() => setOpen(null)} />}
    </>
  )
}
