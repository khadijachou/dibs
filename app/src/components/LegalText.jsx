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
// What's new, newest first. Add one line here and its news_N string per release.
const NEWS = [{ date: '2026-11-10', key: 'news_1' }, { date: '2026-11-09', key: 'news_2' }]
const longDate = (d, lang) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })

export function LegalText({ page }) {
  const { t, lang } = useApp()
  const foot = <p className="legal-date">{t('legal_questions', { email: HELP_EMAIL })}</p>
  if (page === 'news') {
    return (
      <div className="legal">
        <p className="legal-date">{t('legal_news_sub', { v: APP_VERSION })}</p>
        {NEWS.map((n) => <section key={n.key}><h3>{longDate(n.date, lang)}</h3><p>{t(n.key)}</p></section>)}
        {foot}
      </div>
    )
  }
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
