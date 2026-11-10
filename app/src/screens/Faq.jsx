import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'

// The FAQ, moved out of More (More > FAQ). Same questions and answers (faq_<n>q / faq_<n>a).
export const FAQ = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

export default function Faq() {
  const { t, back, canGoBack } = useApp()
  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <h2 className="title">{t('more_faq')}</h2>
        <section className="more-sec">
          {FAQ.map((n) => (
            <details key={n} className="faq">
              <summary>{`${n}. ${t(`faq_${n}q`)}`}</summary>
              <p>{t(`faq_${n}a`)}</p>
            </details>
          ))}
        </section>
      </main>
    </>
  )
}
