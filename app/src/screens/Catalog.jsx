import { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header, Icon } from '../components/ui.jsx'
import { CHIPS, catalogBrands } from '../lib/brands.js'
import { brandColor } from '../lib/brandIcons.js'
import { useReducedMotion } from '../components/UnlockTimer.jsx'

// Entrance stagger: 40 ms per tile, never more than 400 ms for the last one.
const STAGGER_MS = 40
const STAGGER_MAX_MS = 400

// Highlight behind the active chip. It slides with transform only: a left cap, a 1 px middle scaled to the
// chip's width and a right cap, so the round ends never stretch (half a pixel of overlap hides the seams).
// It measures through its own node's parent (.cats), which exists in its first layout effect. No transition
// on the first placement.
function ChipSlider({ active, deps }) {
  const self = useRef(null)
  const [box, setBox] = useState(null)
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    const wrap = self.current?.parentElement
    if (!wrap) return undefined
    const measure = () => {
      const el = wrap.querySelector(`[data-chip="${active}"]`)
      if (el) setBox({ x: el.offsetLeft, w: el.offsetWidth, h: el.offsetHeight, y: el.offsetTop })
    }
    measure()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    ro?.observe(wrap)
    return () => ro?.disconnect()
  }, [active, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!box || ready) return undefined
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [box, ready])
  const r = box ? box.h / 2 : 0
  return (
    <div ref={self} className={`cat-ind${ready ? ' ready' : ''}`} style={box ? { top: box.y, height: box.h } : { visibility: 'hidden' }} aria-hidden="true">
      {box && (
        <>
          <i style={{ width: r, transform: `translateX(${box.x}px)` }} className="l" />
          <i style={{ transform: `translateX(${box.x + r - 0.5}px) scaleX(${Math.max(0, box.w - 2 * r + 1)})` }} className="m" />
          <i style={{ width: r, transform: `translateX(${box.x + box.w - r}px)` }} className="r" />
        </>
      )}
    </div>
  )
}

// One tile per brand; the amount is chosen on the Plan screen (UI v2.2).
// moveFrom: opened from Move > "A new goal"; passed on to Plan and then to the new goal.
export default function Catalog({ moveFrom = null }) {
  const { t, lang, go, back, canGoBack } = useApp()
  const reduced = useReducedMotion()
  const brands = catalogBrands()
  const [chip, setChip] = useState('all')
  const [picked, setPicked] = useState(brands[0]?.key)
  const [glow, setGlow] = useState(null) // { key, n }: the tile whose release glow is playing
  const shown = chip === 'all' ? brands : brands.filter((b) => b.chip === chip)
  const usedChips = CHIPS.filter((c) => brands.some((b) => b.chip === c))
  const brand = brands.find((b) => b.key === picked)

  // Soft brand glow after the press: a keyed layer, so a second tap restarts it (opacity only).
  const pick = (key) => {
    setPicked(key)
    if (!reduced) setGlow((g) => ({ key, n: (g?.n || 0) + 1 }))
  }

  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <div>
          <h2 className="title">{t('cat_title')}</h2>
          <p className="sub" style={{ marginTop: 6 }}>{t('cat_sub')}</p>
        </div>
        <div className={`cats${reduced ? '' : ' slide'}`} role="group">
          {!reduced && <ChipSlider active={chip} deps={[lang, usedChips.length]} />}
          <button type="button" data-chip="all" className={`cat${chip === 'all' ? ' on' : ''}`} aria-pressed={chip === 'all'} onClick={() => setChip('all')}>{t('chip_all', { count: brands.length })}</button>
          {usedChips.map((c) => (
            <button type="button" key={c} data-chip={c} className={`cat${chip === c ? ' on' : ''}`} aria-pressed={chip === c} onClick={() => setChip(c)}>{t('chip_' + c)}</button>
          ))}
        </div>
        {/* key: a new grid per category, so the entrance plays on first load and on each switch, never on scroll. */}
        <div className={`grid${reduced ? '' : ' enter'}`} key={chip}>
          {shown.map((b, i) => (
            <button type="button" key={b.key} className={`btile${b.key === picked ? ' on' : ''}`} aria-pressed={b.key === picked}
              style={{ '--brand': brandColor(b), '--delay': `${Math.min(i * STAGGER_MS, STAGGER_MAX_MS)}ms` }}
              onClick={() => pick(b.key)}>
              {glow?.key === b.key && <i className="btile-glow" key={glow.n} aria-hidden="true" onAnimationEnd={() => setGlow(null)} />}
              {b.key === picked
                ? <span className="chk"><Icon name="check" size={13} stroke={3} /></span>
                : b.popular && <span className="pop">{t('cat_popular')}</span>}
              <BrandLogo brand={b} />
              <b>{b.name}</b>
              <span>{t('cat_from', { price: b.from })}</span>
              {b.estimated && <span className="btile-est">{t('price_checkout')}</span>}
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
