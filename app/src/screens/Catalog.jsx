import { useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header, Icon } from '../components/ui.jsx'
import { CHIPS, catalogBrands } from '../lib/brands.js'
import { brandColor } from '../lib/brandIcons.js'
import { useReducedMotion } from '../components/UnlockTimer.jsx'

// Entrance stagger: 40 ms per tile, never more than 400 ms for the last one.
const STAGGER_MS = 40
const STAGGER_MAX_MS = 400

// Category chip highlight. It lives inside the active chip (inset 0), so at rest it covers that chip exactly,
// whatever the fonts, language or screen width; nothing is measured ahead of time. On a switch it slides from the
// previous chip with a transform-only Web Animation (FLIP: both rects read at tap time). Reduced motion: no slide.
const SLIDE_MS = 280
function useChipSlide(active, reduced) {
  const hl = useRef(null)
  const from = useRef(null)
  const remember = () => { from.current = hl.current?.getBoundingClientRect() || null }
  useLayoutEffect(() => {
    const el = hl.current
    const a = from.current
    from.current = null
    // Keep the whole active chip inside the scrolling row (horizontal only, never the page).
    const chipEl = el?.parentElement
    const row = chipEl?.parentElement
    if (chipEl && row) {
      const left = chipEl.offsetLeft - row.offsetLeft
      const right = left + chipEl.offsetWidth
      if (left < row.scrollLeft) row.scrollLeft = left - 8
      else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth + 8
    }
    if (!el || !a || reduced || typeof el.animate !== 'function') return
    const b = el.getBoundingClientRect()
    if (!b.width) return
    el.animate(
      [{ transform: `translateX(${a.left - b.left}px) scaleX(${a.width / b.width})` }, { transform: 'none' }],
      { duration: SLIDE_MS, easing: 'cubic-bezier(.2, .8, .2, 1)' },
    )
  }, [active, reduced])
  return { hl, remember }
}

// One tile per brand; the amount is chosen on the Plan screen (UI v2.2).
// moveFrom: opened from Move > "A new goal"; passed on to Plan and then to the new goal.
export default function Catalog({ moveFrom = null }) {
  const { t, go, back, canGoBack } = useApp()
  const reduced = useReducedMotion()
  const brands = catalogBrands()
  const [chip, setChip] = useState('all')
  const [picked, setPicked] = useState(brands[0]?.key)
  const [glow, setGlow] = useState(null) // { key, n }: the tile whose release glow is playing
  const shown = chip === 'all' ? brands : brands.filter((b) => b.chip === chip)
  const usedChips = CHIPS.filter((c) => brands.some((b) => b.chip === c))
  const brand = brands.find((b) => b.key === picked)
  const slide = useChipSlide(chip, reduced)
  const pickChip = (c) => { if (c === chip) return; slide.remember(); setChip(c) }
  const chipBtn = (c, label) => (
    <button type="button" key={c} className={`cat${chip === c ? ' on' : ''}`} aria-pressed={chip === c} onClick={() => pickChip(c)}>
      {chip === c && <i className="cat-hl" ref={slide.hl} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  )

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
        <div className="cats hl" role="group">
          {chipBtn('all', t('chip_all', { count: brands.length }))}
          {usedChips.map((c) => chipBtn(c, t('chip_' + c)))}
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
