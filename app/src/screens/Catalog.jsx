import { useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header, Icon } from '../components/ui.jsx'
import { CHIPS, catalogBrands } from '../lib/brands.js'

// One tile per brand; the amount is chosen on the Plan screen (UI v2.2).
// moveFrom: opened from Move > "A new goal"; passed on to Plan and then to the new goal.
export default function Catalog({ moveFrom = null }) {
  const { t, go, back, canGoBack } = useApp()
  const brands = catalogBrands()
  const [chip, setChip] = useState('all')
  const [picked, setPicked] = useState(brands[0]?.key)
  const shown = chip === 'all' ? brands : brands.filter((b) => b.chip === chip)
  const usedChips = CHIPS.filter((c) => brands.some((b) => b.chip === c))
  const brand = brands.find((b) => b.key === picked)

  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <div>
          <h2 className="title">{t('cat_title')}</h2>
          <p className="sub" style={{ marginTop: 6 }}>{t('cat_sub')}</p>
        </div>
        <div className="cats" role="group">
          <button type="button" className={`cat${chip === 'all' ? ' on' : ''}`} onClick={() => setChip('all')}>{t('chip_all', { count: brands.length })}</button>
          {usedChips.map((c) => (
            <button type="button" key={c} className={`cat${chip === c ? ' on' : ''}`} onClick={() => setChip(c)}>{t('chip_' + c)}</button>
          ))}
        </div>
        <div className="grid">
          {shown.map((b) => (
            <button type="button" key={b.key} className={`btile${b.key === picked ? ' on' : ''}`} aria-pressed={b.key === picked} onClick={() => setPicked(b.key)}>
              {b.key === picked
                ? <span className="chk"><Icon name="check" size={13} stroke={3} /></span>
                : b.popular && <span className="pop">{t('cat_popular')}</span>}
              <BrandLogo brand={b} />
              <b>{b.name}</b>
              <span>{t('cat_from', { price: b.from })}</span>
            </button>
          ))}
        </div>
        {shown.length > 6 && <div className="scroll-fade" aria-hidden="true" />}
        <div className="bottom">
          <p className="small center">{t('cat_footer2')}</p>
          <button type="button" className="btn tall" disabled={!brand} onClick={() => go('plan', { brandKey: picked, moveFrom })}>
            {brand && t('cat_cta', { brand: brand.name })}<small>{t('cat_cta_sub')}</small>
          </button>
        </div>
      </main>
    </>
  )
}
