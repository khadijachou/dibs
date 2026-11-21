import { useId } from 'react'
import { useApp } from '../App.jsx'

// Gift banners (v1.7.1, seven more in v1.7.2): pictures drawn in code from the app palette and shapes only. No image
// files, no brand logo, no person, no third-party artwork, no console's shapes or symbols. Ratio 7:3, radius 16 px (the
// container clips), the translated title bottom left in Poppins 700 (cream, ink where noted: congrats, collector,
// treasurer). The same colours in dark and light: they are pictures, not UI. `banner` is one of the eleven ids; 'none'
// or a falsy value renders nothing; any OTHER (unknown) id falls back to the plain coral card, never an error. `thumb`
// drops the title for the small picker tiles. Gradient ids are unique per instance (several can share a page).
const TITLES = {
  birthday: 'frd_banner_birthday', thanks: 'frd_banner_thanks', congrats: 'frd_banner_congrats', because: 'frd_banner_because',
  love: 'gb_love', saver: 'gb_saver', planner: 'gb_planner', gamer: 'gb_gamer', collector: 'gb_collector', treasurer: 'gb_treasurer', legend: 'gb_legend',
}

// A small hexagon (flat top) centred at (cx, cy) with radius r, as a <polygon> (fill/stroke come from the parent <g>).
const HEXPTS = [[0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75], [0, 0.25]]
const hex = (cx, cy, r, key) => <polygon key={key} points={HEXPTS.map(([x, y]) => `${(cx - r + x * 2 * r).toFixed(1)},${(cy - r + y * 2 * r).toFixed(1)}`).join(' ')} />

// A symmetric heart centred at (cx, cy), scaled by s (unit heart is about 22 wide, 19 tall).
const HEART = 'M0 9 C -3 5 -11 1 -11 -4 C -11 -8 -7 -10 -4 -8 C -2 -6.7 -0.7 -5 0 -3 C 0.7 -5 2 -6.7 4 -8 C 7 -10 11 -8 11 -4 C 11 1 3 5 0 9 Z'
const heart = (cx, cy, s, key) => <path key={key} d={HEART} transform={`translate(${cx} ${cy}) scale(${s})`} />
// A four-point sparkle centred at (cx, cy), scaled by s (unit sparkle spans about [-1, 1]).
const SPARK = 'M0 -1 C 0.16 -0.3 0.3 -0.16 1 0 C 0.3 0.16 0.16 0.3 0 1 C -0.16 0.3 -0.3 0.16 -1 0 C -0.3 -0.16 -0.16 -0.3 0 -1 Z'
const spark = (cx, cy, s, key) => <path key={key} d={SPARK} transform={`translate(${cx} ${cy}) scale(${s})`} />

function grad(uid, from, to) {
  return <defs><linearGradient id={uid} x1="0" y1="0" x2="700" y2="300" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} /></linearGradient></defs>
}

function Art({ banner, uid }) {
  if (banner === 'birthday') {
    return (
      <>
        {grad(uid, '#E8482A', '#B8321B')}
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
        {grad(uid, '#15896A', '#0C5A46')}
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
        {grad(uid, '#2D2A38', '#1B1920')}
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
  if (banner === 'love') {
    return (
      <>
        {grad(uid, '#E8482A', '#A8234A')}
        <rect width="700" height="300" fill={`url(#${uid})`} />
        {/* A large faint heart behind, then a cream and a butter heart overlapping on the right. */}
        <g fill="#FFF6EC" opacity="0.13">{heart(580, 150, 9, 'big')}</g>
        {/* Five small hearts around, clear of the bottom-left title. */}
        <g fill="#FFC94D" opacity="0.85">{heart(300, 58, 2, 's1')}{heart(500, 66, 1.7, 's2')}</g>
        <g fill="#FFF6EC" opacity="0.8">{heart(362, 116, 1.6, 's3')}{heart(430, 206, 1.9, 's4')}{heart(262, 168, 1.5, 's5')}</g>
        <g fill="#FFF6EC">{heart(556, 150, 5, 'main')}</g>
        <g fill="#FFC94D" opacity="0.95">{heart(602, 170, 4.1, 'main2')}</g>
      </>
    )
  }
  if (banner === 'saver') {
    return (
      <>
        {grad(uid, '#2BC48F', '#15896A')}
        <rect width="700" height="300" fill={`url(#${uid})`} />
        {/* Six cream bars rising to the right like steps, on the right half (the title sits bottom left). */}
        <g fill="#FFF6EC">{Array.from({ length: 6 }, (_, i) => {
          const h = 40 + i * 30
          return <rect key={i} x={378 + i * 48} y={250 - h} width="36" height={h} rx="6" opacity={0.6 + i * 0.065} />
        })}</g>
      </>
    )
  }
  if (banner === 'planner') {
    return (
      <>
        {grad(uid, '#2D2A38', '#1B1920')}
        <rect width="700" height="300" fill={`url(#${uid})`} />
        {/* A butter glow, a butter ring with a coral arc on top, and a cream centre. */}
        <circle cx="555" cy="150" r="135" fill="#FFC94D" opacity="0.12" />
        <circle cx="555" cy="150" r="70" fill="none" stroke="#FFC94D" strokeWidth="11" opacity="0.9" />
        <circle cx="555" cy="150" r="70" fill="none" stroke="#E8482A" strokeWidth="11" strokeLinecap="round" strokeDasharray="128 440" transform="rotate(-60 555 150)" />
        <circle cx="555" cy="150" r="26" fill="#FFF6EC" />
      </>
    )
  }
  if (banner === 'gamer') {
    return (
      <>
        {grad(uid, '#2D2A38', '#16151B')}
        <rect width="700" height="300" fill={`url(#${uid})`} />
        {/* Faint square pixels. */}
        <g fill="#FFF6EC" opacity="0.06">{[[90, 60], [150, 210], [250, 40], [470, 230], [640, 110], [600, 40], [410, 70], [330, 250]].map(([x, y], i) => <rect key={i} x={x} y={y} width="16" height="16" rx="3" />)}</g>
        {/* A plain rounded controller: a grey body, a cream d-pad, four round buttons (generic, no console's shapes). */}
        <rect x="430" y="96" width="228" height="120" rx="56" fill="#46424f" />
        <g fill="#FFF6EC"><rect x="470" y="136" width="20" height="44" rx="4" /><rect x="458" y="148" width="44" height="20" rx="4" /></g>
        <circle cx="610" cy="134" r="11" fill="#FFC94D" />
        <circle cx="634" cy="158" r="11" fill="#E8482A" />
        <circle cx="610" cy="182" r="11" fill="#2BC48F" />
        <circle cx="586" cy="158" r="11" fill="#FFF6EC" />
      </>
    )
  }
  if (banner === 'collector') {
    const COLORS = ['#E8482A', '#FFC94D', '#2BC48F', '#23212B']
    const dots = []
    let x = 70
    let gap = 70
    for (let c = 0; x < 680; c++) {
      for (let r = 0; r < 5; r++) dots.push(<circle key={`${c}-${r}`} cx={x.toFixed(0)} cy={50 + r * 52} r="7" fill={COLORS[(c + r) % 4]} />)
      x += gap
      gap = Math.max(24, gap - 7) // denser to the right
    }
    return (
      <>
        <rect width="700" height="300" fill="#FFF6EC" />
        <g>{dots}</g>
      </>
    )
  }
  if (banner === 'treasurer') {
    const r = 34
    const dx = 1.5 * r
    const dy = Math.sqrt(3) * r
    const all = []
    const cream = []
    let i = 0
    for (let col = 0; col * dx < 760; col++) {
      for (let row = 0; row * dy < 380; row++) {
        const cx = -20 + col * dx
        const cy = row * dy + (col % 2 ? dy / 2 : 0)
        all.push(hex(cx, cy, r, `a${i}`))
        if (i % 3 === 0) cream.push(hex(cx, cy, r, `c${i}`))
        i += 1
      }
    }
    return (
      <>
        {grad(uid, '#FFD978', '#E0A21F')}
        <rect width="700" height="300" fill={`url(#${uid})`} />
        <g fill="#FFF6EC" opacity="0.4">{cream}</g>
        <g fill="none" stroke="#C8891A" strokeWidth="3" opacity="0.55">{all}</g>
      </>
    )
  }
  if (banner === 'legend') {
    return (
      <>
        {grad(uid, '#E8482A', '#FFC94D')}
        <rect width="700" height="300" fill={`url(#${uid})`} />
        {/* Nested cream hexagons with a coral centre. */}
        <g fill="none" stroke="#FFF6EC" strokeWidth="6" opacity="0.92">{hex(555, 150, 92, 'o')}{hex(555, 150, 62, 'm')}</g>
        <g fill="#E8482A">{hex(555, 150, 34, 'c')}</g>
        {/* Five four-point sparkles, clear of the bottom-left title. */}
        <g fill="#FFF6EC">{spark(300, 58, 20, 'k1')}{spark(360, 120, 13, 'k2')}{spark(250, 150, 11, 'k3')}</g>
        <g fill="#FFC94D">{spark(448, 210, 16, 'k4')}{spark(640, 62, 18, 'k5')}</g>
      </>
    )
  }
  // plain: the fallback coral card (a cream hexagon with a coral hexagon inside), for no banner or an unknown id.
  return (
    <>
      {grad(uid, '#E8482A', '#B8321B')}
      <rect width="700" height="300" fill={`url(#${uid})`} />
      <g fill="#FFF6EC">{hex(350, 150, 70, 'c')}</g>
      <g fill="#E8482A">{hex(350, 150, 40, 'i')}</g>
    </>
  )
}

// The plain coral card (no title): the reveal uses it when the gift carries no banner. GiftBanner uses it for an
// unknown id. Drawn here so there is a single source for the fallback picture.
export function PlainGiftCard({ thumb = false }) {
  const uid = `gb-${useId().replace(/[^a-z0-9]/gi, '')}`
  return (
    <div className={`gift-banner gb-plain${thumb ? ' thumb' : ''}`}>
      <svg viewBox="0 0 700 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><Art banner="plain" uid={uid} /></svg>
    </div>
  )
}

export default function GiftBanner({ banner, thumb = false }) {
  const { t } = useApp()
  const uid = `gb-${useId().replace(/[^a-z0-9]/gi, '')}`
  if (!banner || banner === 'none') return null
  const titleKey = TITLES[banner]
  if (!titleKey) return <PlainGiftCard thumb={thumb} /> // unknown id: the plain coral card, never an error
  return (
    <div className={`gift-banner gb-${banner}${thumb ? ' thumb' : ''}`}>
      <svg viewBox="0 0 700 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><Art banner={banner} uid={uid} /></svg>
      {!thumb && <b className="gb-title">{t(titleKey)}</b>}
    </div>
  )
}
