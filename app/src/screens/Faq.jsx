import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'

// The FAQ, moved out of More (More > FAQ). Numbered entries use faq_<n>q / faq_<n>a; named ones faq_<name>_q /
// faq_<name>_a (card versions, after FAQ 10). Shown numbered in this order.
export const FAQ = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'region', 11]
const qKey = (n) => (typeof n === 'number' ? `faq_${n}q` : `faq_${n}_q`)
const aKey = (n) => (typeof n === 'number' ? `faq_${n}a` : `faq_${n}_a`)

export default function Faq() {
  const { t, back, canGoBack } = useApp()
  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <h2 className="title">{t('more_faq')}</h2>
        <section className="more-sec">
          {FAQ.map((n, i) => (
            <details key={n} className="faq">
              <summary>{`${i + 1}. ${t(qKey(n))}`}</summary>
              <p>{t(aKey(n))}</p>
            </details>
          ))}
        </section>
      </main>
    </>
  )
}
