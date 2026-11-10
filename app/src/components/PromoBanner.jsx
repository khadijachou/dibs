import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { CHIPS, catalogBrands } from '../lib/brands.js'

// Home: a swipeable banner of things you can call dibs on. Each slide is a finished picture from src/assets/promo/
// (photo, faded film look and brand logo baked in, 1200x675), with one line, "Call dibs on {brand}" and a
// "Saved in NIM" badge as live text on top (3 languages). Tap opens the brand sheet.
// Pool = every catalogue brand with a picture <brand key>.jpg (or .webp) AND a promo_<key> line below.
// Each launch shows one slide per category, picked at random. Auto-advances every 5 s, pauses while touched;
// reduced motion: no auto-advance.
const PHOTOS = Object.fromEntries(Object.entries(import.meta.glob('../assets/promo/*.{jpg,jpeg,webp}', { eager: true, import: 'default' }))
  .map(([path, url]) => [path.split('/').pop().replace(/\.(jpe?g|webp)$/i, ''), url]))
// Brands that have a promo_<key> line in every language.
const LINES = ['steam', 'playstation', 'xbox', 'airbnb', 'hotels', 'flightgift', 'uber', 'netflix', 'disney', 'ubereats', 'doordash', 'starbucks', 'amazon', 'apple', 'bestbuy']

const NimiqHex = () => (
  <svg viewBox="0 0 27 24" width="11" height="11" aria-hidden="true">
    <path fill="currentColor" d="M26.6991 10.875L21.0741 1.125C20.6691 0.4275 19.9266 0 19.1241 0H7.87414C7.07164 0 6.32914 0.4275 5.92789 1.125L0.302891 10.875C-0.0983594 11.5725 -0.0983594 12.4275 0.302891 13.125L5.92789 22.875C6.32914 23.5725 7.07164 24 7.87414 24H19.1241C19.9266 24 20.6691 23.5725 21.0704 22.875L26.6954 13.125C27.1004 12.4275 27.1004 11.5725 26.6991 10.875Z" />
  </svg>
)

// One slide per category (lib/brands.js chip), at random, in the CHIPS order so the slides always mix.
function pickSlides(brands) {
  const pool = brands.filter((b) => PHOTOS[b.key] && LINES.includes(b.key))
  return CHIPS.map((c) => {
    const opts = pool.filter((b) => b.chip === c)
    return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null
  }).filter(Boolean)
}

export default function PromoBanner({ onOpen }) {
  const { t } = useApp()
  const brands = catalogBrands()
  const slides = useMemo(() => pickSlides(brands), [brands.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef(null)
  const hold = useRef(false)
  const [cur, setCur] = useState(0)
  useEffect(() => {
    let reduced = false
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* old browser */ }
    if (reduced || slides.length < 2) return
    const id = setInterval(() => {
      const el = ref.current
      if (!el || hold.current) return
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % slides.length
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    }, 5000)
    return () => clearInterval(id)
  }, [slides.length])
  if (!slides.length) return null
  const onScroll = () => { const el = ref.current; if (el) setCur(Math.round(el.scrollLeft / el.clientWidth)) }
  return (
    <section className="promo" aria-roledescription="carousel" aria-label={t('promo_label')}>
      <div className="promo-track" ref={ref} onScroll={onScroll}
        onPointerDown={() => { hold.current = true }} onPointerUp={() => { hold.current = false }} onPointerLeave={() => { hold.current = false }}>
        {slides.map((b, i) => (
          <button type="button" key={b.key} className="promo-slide" aria-haspopup="dialog" onClick={() => onOpen?.(b.key)}>
            <img className="promo-photo" src={PHOTOS[b.key]} alt="" loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
            <span className="promo-shade" aria-hidden="true" />
            <span className="promo-nq"><NimiqHex />{t('promo_badge')}</span>
            <span className="promo-txt">
              <b>{t(`promo_${b.key}`)}</b>
              <small>{t('cat_cta', { brand: b.name })} ›</small>
            </span>
          </button>
        ))}
      </div>
      <span className="cdots promo-dots" aria-hidden="true">{slides.map((b, k) => <i key={b.key} className={k === cur ? 'on' : undefined} />)}</span>
    </section>
  )
}
