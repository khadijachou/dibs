import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { LegalText } from '../components/LegalText.jsx'

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
        <LegalText page={page} />
      </main>
    </>
  )
}
