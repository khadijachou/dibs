import { useState } from 'react'
import { useApp } from '../App.jsx'
import { version } from '../../package.json'

// Privacy, Terms, Rewards and What's new, in en/fr/es (lib/i18n.js privacy_*, terms_*, news_*). Used by the Legal screen
// (More > Legal) and by the sheets opened from the onboarding agreement line.
// Every sentence must stay true to the code: when what Dibs does with data changes, update the texts and LEGAL_UPDATED.
export const APP_VERSION = version.replace(/\.0$/, '') // "1.0.0" -> "1.0"
export const LEGAL_UPDATED = '2026-11-10'
export const HELP_EMAIL = 'calldibs.contact@gmail.com'
// Sections per page (privacy_1h..7b, terms_1h..7b, rewards_1h..6b).
const SECTIONS = { privacy: 7, terms: 7, rewards: 6 }
// What's new, newest first: one block per release (v = the version pill; news_2 has none, its date is the header).
// Add one line here and its news_N string per release; a news_N holds one item per line ("\n"), same count in en/fr/es.
export const NEWS = [
  { date: '2026-11-12', key: 'news_8', v: '1.0.7' },
  { date: '2026-11-12', key: 'news_7', v: '1.0.6' },
  { date: '2026-11-12', key: 'news_6', v: '1.0.4' },
  { date: '2026-11-12', key: 'news_5', v: '1.0.3' },
  { date: '2026-11-11', key: 'news_4', v: '1.0.2' },
  { date: '2026-11-11', key: 'news_3', v: '1.0.1' },
  { date: '2026-11-10', key: 'news_1', v: '1.0' },
  { date: '2026-11-09', key: 'news_2' },
]
const NEWS_SHOWN = 3 // the others wait behind "Show earlier updates"
export const newsItems = (text) => String(text).split('\n').map((x) => x.trim()).filter(Boolean)
const longDate = (d, lang) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })

export function LegalText({ page }) {
  const { t, lang } = useApp()
  const foot = <p className="legal-date">{t('legal_questions', { email: HELP_EMAIL })}</p>
  if (page === 'news') return <News foot={foot} />
  return (
    <div className="legal">
      <p className="legal-date">{t('legal_updated', { date: longDate(LEGAL_UPDATED, lang) })}</p>
      <p className="legal-lead">{t(`${page}_lead`)}</p>
      {Array.from({ length: SECTIONS[page] || 0 }, (_, i) => (
        <section key={i}><h3>{t(`${page}_${i + 1}h`)}</h3><p>{t(`${page}_${i + 1}b`)}</p></section>
      ))}
      {foot}
    </div>
  )
}

// What's new as a timeline: "You're on v…", then one block per release, newest first (coral dot and pill, "New" tag),
// one bullet per change. Only the 3 newest show; the button under them shows the rest in place and goes away.
function News({ foot }) {
  const { t, lang } = useApp()
  const [all, setAll] = useState(false)
  const shown = all ? NEWS : NEWS.slice(0, NEWS_SHOWN)
  const hidden = NEWS.length - shown.length
  return (
    <div className="legal news">
      <p className="news-on"><i aria-hidden="true" />{t('news_on', { v: APP_VERSION })}</p>
      <ol className="news-tl">
        {shown.map((n, i) => (
          <li key={n.key} className={`news-rel${i === 0 ? ' latest' : ''}`}>
            <div className="news-head">
              <span className="news-when">
                {n.v && <span className="news-pill">v{n.v}</span>}
                <span className={n.v ? 'news-date' : 'news-date solo'}>{longDate(n.date, lang)}</span>
              </span>
              {i === 0 && <span className="news-new">{t('news_new')}</span>}
            </div>
            <ul className="news-items">{newsItems(t(n.key)).map((it, j) => <li key={j}>{it}</li>)}</ul>
          </li>
        ))}
      </ol>
      {hidden > 0 && <button type="button" className="news-more" onClick={() => setAll(true)}>{t('news_earlier', { n: hidden })}</button>}
      {foot}
    </div>
  )
}
