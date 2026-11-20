import { useEffect, useRef } from 'react'
import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'

// The FAQ, moved out of More (More > FAQ). Numbered entries use faq_<n>q / faq_<n>a; named ones faq_<name>_q /
// faq_<name>_a (card versions, after FAQ 10; the gap, last). Shown numbered in this order.
export const FAQ = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'region', 11, 'gap', 'insights']
const qKey = (n) => (typeof n === 'number' ? `faq_${n}q` : `faq_${n}_q`)
const aKey = (n) => (typeof n === 'number' ? `faq_${n}a` : `faq_${n}_a`)

// open: an entry key (e.g. 'gap') to open and scroll into view (Savings' "Why?" link). Without it, all closed as before.
export default function Faq({ open = null }) {
  const { t, back, canGoBack } = useApp()
  const openRef = useRef(null)
  useEffect(() => {
    const el = openRef.current
    if (!open || !el) return
    el.open = true
    el.scrollIntoView({ block: 'center' })
  }, [open])
  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <h2 className="title">{t('more_faq')}</h2>
        <section className="more-sec">
          {FAQ.map((n, i) => (
            <details key={n} ref={n === open ? openRef : undefined} className="faq">
              <summary>{`${i + 1}. ${t(qKey(n))}`}</summary>
              <p>{t(aKey(n))}</p>
            </details>
          ))}
        </section>
      </main>
    </>
  )
}
