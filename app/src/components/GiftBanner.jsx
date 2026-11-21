import { useId } from 'react'
import { useApp } from '../App.jsx'

// Gift banners (v1.7.1): four pictures drawn in code from the app palette and shapes only. No image files, no brand
// logo, no person, no third-party artwork. Ratio 7:3, radius 16 px (the container clips), the translated title bottom
// left in Poppins 700 (cream, ink on congrats). The same colours in dark and light: they are pictures, not UI.
// `banner` is one of 'birthday' | 'thanks' | 'congrats' | 'because'; anything else (including 'none') renders nothing.
// `thumb` drops the title for the small picker tiles. Gradient ids are made unique per instance (several can share a page).
const TITLES = { birthday: 'frd_banner_birthday', thanks: 'frd_banner_thanks', congrats: 'frd_banner_congrats', because: 'frd_banner_because' }

// A small hexagon (flat top) centred at (cx, cy) with radius r, as a <polygon>.
const HEXPTS = [[0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75], [0, 0.25]]
const hex = (cx, cy, r, key) => <polygon key={key} points={HEXPTS.map(([x, y]) => `${(cx - r + x * 2 * r).toFixed(1)},${(cy - r + y * 2 * r).toFixed(1)}`).join(' ')} />

function Art({ banner, uid }) {
  if (banner === 'birthday') {
    return (
      <>
        <defs><linearGradient id={uid} x1="0" y1="0" x2="700" y2="300" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#E8482A" /><stop offset="1" stopColor="#B8321B" /></linearGradient></defs>
        <rect width="700" height="300" fill={`url(#${uid})`} />
        {/* Confetti kept to the top and right, clear of the bottom-left title. */}
        <g fill="#FFC94D">{hex(470, 70, 24, 'a')}<circle cx="600" cy="150" r="11" /><rect x="320" y="36" width="36" height="12" rx="6" transform="rotate(-18 338 42)" /></g>
        <g fill="#FFF6EC">{hex(560, 205, 19, 'b')}<circle cx="412" cy="140" r="8" /><rect x="615" y="60" width="32" height="11" rx="5" transform="rotate(26 631 66)" /></g>
        <g fill="#15896A">{hex(655, 250, 17, 'c')}<circle cx="300" cy="100" r="9" /><rect x="498" y="248" width="32" height="11" rx="5" transform="rotate(12 514 254)" /></g>
      </>
    )
  }
  if (banner === 'thanks') {
    return (
      <>
        <defs><linearGradient id={uid} x1="0" y1="0" x2="700" y2="300" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#15896A" /><stop offset="1" stopColor="#0C5A46" /></linearGradient></defs>
        <rect width="700" height="300" fill={`url(#${uid})`} />
        {/* Concentric cream rings, top right. */}
        <g fill="none" stroke="#FFF6EC" strokeWidth="7" opacity="0.9">
          <circle cx="650" cy="20" r="60" /><circle cx="650" cy="20" r="110" /><circle cx="650" cy="20" r="160" opacity="0.7" /><circle cx="650" cy="20" r="210" opacity="0.45" />
        </g>
      </>
    )
  }
  if (banner === 'congrats') {
    return (
      <>
        <rect width="700" height="300" fill="#FFC94D" />
        {/* Coral rays at low opacity, from behind the hexagon on the right. */}
        <g fill="#E8482A" opacity="0.16">{Array.from({ length: 12 }, (_, i) => <rect key={i} x="560" y="147" width="340" height="6" transform={`rotate(${i * 30} 560 150)`} />)}</g>
        {/* A coral hexagon with a cream centre. */}
        <g fill="#E8482A">{hex(560, 150, 78, 'h')}</g>
        <g fill="#FFF6EC">{hex(560, 150, 34, 'c')}</g>
      </>
    )
  }
  if (banner === 'because') {
    return (
      <>
        <defs><linearGradient id={uid} x1="0" y1="0" x2="700" y2="300" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#2D2A38" /><stop offset="1" stopColor="#1B1920" /></linearGradient></defs>
        <rect width="700" height="300" fill={`url(#${uid})`} />
        {/* Three diagonal ribbons on the right. */}
        <g transform="rotate(-24 560 150)">
          <rect x="520" y="-80" width="46" height="460" fill="#E8482A" />
          <rect x="582" y="-80" width="46" height="460" fill="#FFC94D" />
          <rect x="644" y="-80" width="46" height="460" fill="#15896A" />
        </g>
      </>
    )
  }
  return null
}

export default function GiftBanner({ banner, thumb = false }) {
  const { t } = useApp()
  const uid = `gb-${useId().replace(/[^a-z0-9]/gi, '')}`
  if (!TITLES[banner]) return null
  return (
    <div className={`gift-banner gb-${banner}${thumb ? ' thumb' : ''}`}>
      <svg viewBox="0 0 700 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><Art banner={banner} uid={uid} /></svg>
      {!thumb && <b className="gb-title">{t(TITLES[banner])}</b>}
    </div>
  )
}
