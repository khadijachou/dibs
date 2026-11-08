import { useApp } from '../App.jsx'

// VF screen 01: shown while start() connects (and at least 900 ms on launch).
// The connecting status stays readable for screen readers.
const CARDS = [
  { key: 'steam', name: 'Steam', logo: '/logos/steam.png', price: '5 USD', x: '-14px', y: '10%', r: '-14deg', bg: 'linear-gradient(145deg, #1b2838, #0f1b2b)' },
  { key: 'netflix', name: 'Netflix', logo: '/logos/netflix.png', price: '25 EUR', x: 'calc(100% - 118px)', y: '19%', r: '12deg', bg: 'linear-gradient(145deg, #3a0f12, #1d0a0c)' },
  { key: 'amazon', name: 'Amazon', logo: '/logos/amazon.png', price: '10 USD', x: 'calc(100% - 168px)', y: '74%', r: '-6deg', bg: 'linear-gradient(145deg, #2a2733, #1c1a22)' },
]

// "Call dibs. Save up. It's yours." -> three lines
const lines = (s) => s.split(/(?<=\.)\s+/)

export default function Splash() {
  const { t } = useApp()
  const tag = lines(t('splash_tag'))
  return (
    <div className="app splash">
      <p className="sr-only" role="status">{t('loading')}</p>
      <div className="splash-cards" aria-hidden="true">
        {CARDS.map((c, i) => (
          <div key={c.key} className="fc" style={{ '--x': c.x, '--y': c.y, '--r': c.r, '--d': `${i * -1.3}s`, background: c.bg }}>
            <img src={c.logo} alt="" />
            <b>{c.name}</b>
            <span>{t('cat_from', { price: c.price })}</span>
          </div>
        ))}
      </div>
      <div className="splash-mid">
        <div className="splash-mark" aria-hidden="true">
          <svg viewBox="0 0 156 156"><circle cx="78" cy="78" r="66" fill="none" stroke="#E8482A" strokeWidth="12" /></svg>
          <img src="/brand/mark-cream.png" alt="" />
        </div>
        <img className="splash-word" src="/brand/wordmark-cream.png" alt="Dibs" />
        <p className="splash-tag">
          {tag.map((l, i) => <span key={i} className={i === tag.length - 1 ? 'last' : ''}>{l}</span>)}
        </p>
      </div>
      <p className="splash-line">{t('splash_line')}</p>
    </div>
  )
}
