import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../App.jsx'
import { Icon, BrandLogo } from './ui.jsx'
import GiftBanner, { PlainGiftCard } from './GiftBanner.jsx'
import { brandByKey } from './FriendsParts.jsx'
import { sayThanks } from '../lib/gifts.js'
import { playGoalDone } from '../lib/sound.js'

// Gift reveal (v1.7.2): the full-screen overlay the RECEIVER gets for a gift a friend marked as sent (lib/reveal.js
// picks the next one; App.jsx mounts this above Home and the nav, only with Friends on). Three states: a sealed card
// that waits for a tap, a ~1 s opening with confetti and the app's celebration sound (only if Sound is on), then the
// open banner with the message, the brand row and Say thanks. Display only: it never moves NIM, never shows a code or a
// wallet address, and implies no partnership with the shop or a brand. Props: { gift, onClose }. onClose marks the gift
// seen on this phone (so it never reopens) and closes; every exit (Later, the x, Say thanks) goes through it.
const prefersReduced = () => { try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) } catch { return false } }

// The sealed gift card drawn in code (state 1): coral gradient, a butter ribbon across the middle, a cream hexagon with
// a coral hexagon inside. No brand logo. Tilted by CSS (.rv-sealed).
function SealedCard() {
  return (
    <div className="rv-sealed" aria-hidden="true">
      <svg viewBox="0 0 300 190" preserveAspectRatio="xMidYMid meet">
        <defs><linearGradient id="rv-seal" x1="0" y1="0" x2="300" y2="190" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#E8482A" /><stop offset="1" stopColor="#B8321B" /></linearGradient></defs>
        <rect x="6" y="6" width="288" height="178" rx="20" fill="url(#rv-seal)" />
        <rect x="6" y="82" width="288" height="26" fill="#FFC94D" />
        <polygon points="150,54 177,70 177,102 150,118 123,102 123,70" fill="#FFF6EC" />
        <polygon points="150,76 163,84 163,100 150,108 137,100 137,84" fill="#E8482A" />
      </svg>
    </div>
  )
}

// The opening confetti (state 2): hexagons, dots and short bars in butter, cream, teal and coral. Decorative.
const CONFETTI = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11']
const Confetti = () => <div className="rv-confetti" aria-hidden="true">{CONFETTI.map((c) => <i key={c} className={`rvc ${c}`} />)}</div>

export default function GiftReveal({ gift, onClose }) {
  const { t, toast } = useApp()
  const reduced = prefersReduced()
  const [phase, setPhase] = useState('closed') // 'closed' | 'opening' | 'open'
  const [thanked, setThanked] = useState(Boolean(gift?.thanked))
  const [busy, setBusy] = useState(false)
  const name = gift?.from?.name || ''
  const brand = brandByKey(gift?.brandKey)
  const brandName = (brand?.name || gift?.brandKey || '').replace(/ gift card$/i, '')
  const hasBanner = gift?.banner && gift.banner !== 'none'

  // State 2 runs for about a second, then opens. Reduced motion skips straight to state 3 (a plain fade). The sound
  // follows the Sound setting either way (playGoalDone is silent when Sound is off).
  const open = () => {
    if (reduced) { playGoalDone(); setPhase('open'); return }
    setPhase('opening')
    playGoalDone()
  }
  useEffect(() => {
    if (phase !== 'opening') return undefined
    const id = setTimeout(() => setPhase('open'), 1050)
    return () => clearTimeout(id)
  }, [phase])

  const say = async () => {
    setBusy(true)
    try { await sayThanks(gift.brandKey); setThanked(true); setTimeout(onClose, 600) }
    catch { toast(t('frd_save_fail')); setBusy(false) } // the overlay stays; the user can try again or tap Later
  }

  return createPortal(
    <div className={`rv-bg rv-${phase}${reduced ? ' rv-reduced' : ''}`} role="dialog" aria-modal="true" aria-label={t('rv_over')}>
      <button type="button" className="rv-x" aria-label={t('rv_later')} onClick={onClose}><Icon name="close" size={22} stroke={2} /></button>

      {phase === 'closed' ? (
        <div className="rv-stage">
          <span className="rv-over">{t('rv_over')}</span>
          <SealedCard />
          <h2 className="rv-title">{t('rv_title', { name })}</h2>
          <p className="rv-sub">{t('rv_sub')}</p>
          <div className="rv-acts">
            <button type="button" className="btn rv-open-btn" onClick={open}>{t('rv_open')}</button>
            <button type="button" className="btn ghost" onClick={onClose}>{t('rv_later')}</button>
          </div>
        </div>
      ) : (
        <div className="rv-stage">
          {phase === 'opening' && <Confetti />}
          <span className="rv-over">{t('rv_over')}</span>
          <div className="rv-banner-wrap">
            {hasBanner ? <GiftBanner banner={gift.banner} /> : <PlainGiftCard />}
          </div>
          {phase === 'open' && (
            <>
              {gift.message && <p className="rv-msg">{gift.message}</p>}
              <div className="rv-brand">
                {brand && <BrandLogo brand={brand} className="frd-brand-logo" />}
                <span className="frd-row-mid"><b>{t('rv_card', { brand: brandName })}</b><small>{t('rv_from', { name })}</small></span>
              </div>
              <p className="rv-code">{t('rv_code', { name })}</p>
              <div className="rv-acts">
                {thanked
                  ? <button type="button" className="btn rv-open-btn" disabled>{t('rv_thanks_sent')}</button>
                  : <button type="button" className="btn rv-open-btn" disabled={busy} onClick={say}>{t('rv_thanks', { name })}</button>}
                <button type="button" className="btn ghost" onClick={onClose}>{t('rv_later')}</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
