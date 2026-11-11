import { useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header, Icon } from '../components/ui.jsx'
import { CHIPS, brandGrad, catalogBrands } from '../lib/brands.js'
import { fromText } from '../lib/itemName.js'
import { useReducedMotion } from '../components/UnlockTimer.jsx'
import BrandSheet from '../components/BrandSheet.jsx'

// Entrance stagger: 40 ms per tile, never more than 400 ms for the last one.
const STAGGER_MS = 40
const STAGGER_MAX_MS = 400

// The Popular row, in this order (a brand missing from the live catalogue is skipped).
const POPULAR = ['netflix', 'playstation', 'airbnb', 'starbucks']

// Category chip highlight. It lives inside the active chip (inset 0), so at rest it covers that chip exactly,
// whatever the fonts, language or screen width; nothing is measured ahead of time. On a switch it slides from the
// previous chip with a transform-only Web Animation (FLIP: both rects read at tap time). Reduced motion: no slide.
const SLIDE_MS = 280
export function useChipSlide(active, reduced) {
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

// A brand as a gift card: logo and delivery pill on top, name and lowest price at the bottom. A tap opens the sheet.
export function GiftTile({ brand, big = false, style, onOpen }) {
  const { t } = useApp()
  return (
    <button type="button" className={`gtile${big ? ' big' : ''}`} aria-haspopup="dialog"
      style={{ ...style, background: brandGrad(brand.key) }} onClick={() => onOpen(brand)}>
      <i className="gift-sheen" aria-hidden="true" />
      <span className="gtile-top">
        <BrandLogo brand={brand} />
        {brand.delivers && <span className="gtile-pill">{t(`dlv_short_${brand.delivers}`)}</span>}
      </span>
      <span className="gtile-bot">
        <b>{brand.name}</b>
        <span>{fromText(t, brand)}</span>
      </span>
    </button>
  )
}

// The one catalogue: Goals > New goal and See all, Move > A new goal, Change card, More > Catalogue.
// A tile opens the brand sheet; its button starts the goal on Plan (the amount is chosen there).
// moveFrom: opened from Move > "A new goal"; passed on to Plan and then to the new goal.
// changeFor: a goal id whose card is no longer available (components/CardIssue.jsx); Plan then swaps that goal's card.
export default function Catalog({ moveFrom = null, changeFor = null, chip: initialChip = null }) {
  const { t, go, back, canGoBack } = useApp()
  const reduced = useReducedMotion()
  const brands = catalogBrands()
  const [chip, setChip] = useState(() => (CHIPS.includes(initialChip) ? initialChip : 'all')) // initial category (Quest of the week)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null) // brand key whose sheet is open
  // Search: the start of any word in the brand name, any case ("st": Steam, PlayStation Store, Starbucks; not Best Buy).
  const query = q.trim()
  const match = query ? new RegExp(`(^|[^\\p{L}\\p{N}])${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu') : null
  const shown = brands.filter((b) => (chip === 'all' || b.chip === chip) && (!match || match.test(b.name)))
  const popular = POPULAR.map((k) => brands.find((b) => b.key === k)).filter(Boolean)
  const usedChips = CHIPS.filter((c) => brands.some((b) => b.chip === c))
  const slide = useChipSlide(chip, reduced)
  const pickChip = (c) => { if (c === chip) return; slide.remember(); setChip(c) }
  const chipBtn = (c, label) => (
    <button type="button" key={c} className={`cat${chip === c ? ' on' : ''}`} aria-pressed={chip === c} onClick={() => pickChip(c)}>
      {chip === c && <i className="cat-hl" ref={slide.hl} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  )
  const openSheet = (b) => setOpen(b.key)
  const sheetBrand = brands.find((b) => b.key === open)
  const pick = (region) => {
    const brandKey = sheetBrand.key
    setOpen(null)
    go('plan', { brandKey, region, moveFrom, changeFor })
  }

  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <div>
          <h2 className="title">{t('cat_title')}</h2>
          <p className="sub" style={{ marginTop: 6 }}>{t(changeFor ? 'change_sub' : 'cat_sub')}</p>
        </div>
        <label className="cat-search">
          <Icon name="search" size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cat_search', { count: brands.length })}
            aria-label={t('cat_search', { count: brands.length })} autoComplete="off" enterKeyHint="search" />
        </label>
        {!query && chip === 'all' && popular.length > 0 && (
          <section className="cat-pop">
            <div className="sec-head"><h3>{t('cat_popular')}</h3></div>
            <div className="pop-row">
              {popular.map((b) => <GiftTile key={b.key} brand={b} big onOpen={openSheet} />)}
            </div>
          </section>
        )}
        <div className="cats hl" role="group">
          {chipBtn('all', t('chip_all', { count: brands.length }))}
          {usedChips.map((c) => chipBtn(c, t('chip_' + c)))}
        </div>
        {shown.length === 0 ? (
          <p className="small center cat-none">{t('cat_none', { q: query })}</p>
        ) : (
          // key: a new grid per category, so the entrance plays on first load and on each switch, never on scroll.
          <div className={`grid gift-grid${reduced ? '' : ' enter'}`} key={chip}>
            {shown.map((b, i) => (
              <GiftTile key={b.key} brand={b} onOpen={openSheet} style={{ '--delay': `${Math.min(i * STAGGER_MS, STAGGER_MAX_MS)}ms` }} />
            ))}
          </div>
        )}
        <section className="cat-source">
          <div className="cat-source-head">
            <img className="cat-source-logo" src="/logos/bittrefill.png" alt="" aria-hidden="true" />
            <h3>{t('cat_src_title')}</h3>
          </div>
          <p>{t('cat_src_body')}</p>
          <p className="cat-source-legal">{t('cat_src_legal')}</p>
        </section>
      </main>
      {sheetBrand && <BrandSheet brand={sheetBrand} onClose={() => setOpen(null)} onPick={pick} />}
    </>
  )
}
