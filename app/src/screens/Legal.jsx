import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { LegalText } from '../components/LegalText.jsx'
import { Medal } from '../components/Badge.jsx'
import { fmtNim } from '../lib/format.js'
import { CLAIM_EMAIL, PROGRAM_END, REWARDS } from '../lib/rewards.js'

// More > Legal: Privacy, Terms, Rewards and What's new (params.page).
const PAGES = ['privacy', 'terms', 'rewards', 'news']

export default function Legal({ page: asked }) {
  const { t, back, canGoBack } = useApp()
  const page = PAGES.includes(asked) ? asked : 'privacy'
  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <h2 className="title">{t(`legal_${page}`)}</h2>
        {page === 'rewards' ? <RewardsPage /> : <LegalText page={page} />}
      </main>
    </>
  )
}

// More > Rewards (v1.1.12): the hero, one tile per reward, the four claim steps and the rules. Every figure comes from
// lib/rewards.js (amounts, places, the 7 days, the end date, the email). Display and copy only: nothing is sent.
const endLong = (lang) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(PROGRAM_END))

function RewardsPage() {
  const { t, lang } = useApp()
  const tiles = [
    { id: 'dibs', sub: t('rwp_dibs', { n: REWARDS.dibs.places }) },
    { id: 'planted', sub: t('rwp_planted', { n: REWARDS.planted.places, days: REWARDS.planted.holdDays }) },
  ]
  const steps = [t('rwp_step1'), t('rwp_step2'), t('rwp_step3', { email: CLAIM_EMAIL }), t('rwp_step4')]
  return (
    <div className="rwp">
      <section className="rwp-hero">
        <span className="rwp-tag">{t('rw_until', { date: endLong(lang) })}</span>
        <h3>{t('rwp_title')}</h3>
        <p>{t('rwp_line')}</p>
      </section>
      <div className="rwp-tiles">
        {tiles.map((x) => (
          <section className="rwp-tile" key={x.id}>
            <Medal id={x.id} earned size={52} />
            <b className="rwp-amt">{t('rw_amount', { amount: fmtNim(REWARDS[x.id].nim, lang) })}</b>
            <span className="rwp-badge">{t('rwp_badge', { badge: t(`badge_${x.id}`) })}</span>
            <p>{x.sub}</p>
          </section>
        ))}
      </div>
      <section className="rwp-sec">
        <h3>{t('rw_claim_btn')}</h3>
        <ol className="rwp-steps">
          {steps.map((s, i) => <li key={i}><span className="rwp-n" aria-hidden="true">{i + 1}</span><span>{s}</span></li>)}
        </ol>
      </section>
      <section className="rwp-sec">
        <h3>{t('rwp_more_h')}</h3>
        <p>{t('rwp_more1')}</p>
        <p>{t('rwp_more2')}</p>
        <p>{t('rwp_more3')}</p>
      </section>
    </div>
  )
}
