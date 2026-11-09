import { useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, LangSwitch, Sheet } from '../components/ui.jsx'
import { listGoals } from '../lib/goals.js'
import { lastTxHash } from '../lib/history.js'
import { readLog } from '../lib/errors.js'
import { host } from '../lib/nimiq.js'
import { PastList } from './Home.jsx'

const FAQ = [1, 2, 3, 4]
const soundOn = () => { try { return localStorage.getItem('dibs.sound') !== 'off' } catch { return true } }

export default function More() {
  const { t, address, showHowTo } = useApp()
  const [sound, setSound] = useState(soundOn)
  const [report, setReport] = useState(false)
  const bought = listGoals(address).filter((g) => g.status === 'redeemed')

  const toggleSound = () => {
    const next = !sound
    try { localStorage.setItem('dibs.sound', next ? 'on' : 'off') } catch { /* private mode */ }
    setSound(next)
  }

  return (
    <>
      <Header />
      <main className="screen">
        <h2 className="title">{t('tab_more')}</h2>

        <section className="more-sec">
          <div className="sec-head"><h3>{t('more_cards')}</h3></div>
          {bought.length ? <PastList goals={bought} /> : <p className="small">{t('more_cards_empty')}</p>}
        </section>

        <section className="more-sec">
          <button type="button" className="sheet-row" onClick={showHowTo}>
            <span className="si" aria-hidden="true">?</span>
            <span><b>{t('more_howto')}</b><small>{t('more_howto_sub')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        </section>

        <section className="more-sec">
          <div className="sec-head"><h3>{t('more_faq')}</h3></div>
          {FAQ.map((n) => (
            <details key={n} className="faq">
              <summary>{t(`faq_${n}q`)}</summary>
              <p>{t(`faq_${n}a`)}</p>
            </details>
          ))}
        </section>

        <section className="more-sec">
          <div className="sec-head"><h3>{t('more_settings')}</h3></div>
          <div className="set-row"><span>{t('lang_label')}</span><LangSwitch /></div>
          <div className="set-row">
            <span>{t('more_sound')}</span>
            <button type="button" role="switch" aria-checked={sound} aria-label={t('more_sound')} className={`switch${sound ? ' on' : ''}`} onClick={toggleSound}><i /></button>
          </div>
        </section>

        <section className="more-sec">
          <button type="button" className="sheet-row" onClick={() => setReport(true)}>
            <span className="si" aria-hidden="true">!</span>
            <span><b>{t('more_report')}</b><small>{t('more_report_sub')}</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        </section>
      </main>
      {report && <ReportSheet onClose={() => setReport(false)} />}
    </>
  )
}

// Prefilled with the newest transaction hash on this device and the last logged error. Copy only, nothing is sent.
function ReportSheet({ onClose }) {
  const { t, lang, address, demo, toast } = useApp()
  const [text, setText] = useState(() => {
    const err = readLog().slice(-1)[0]
    return [
      '',
      '',
      '---',
      `${t('report_last_tx')}: ${lastTxHash(listGoals(address)) || '-'}`,
      `Dibs · ${demo ? 'demo' : host.network()} · ${lang}`,
      err ? `${t('report_last_error')}: ${err.ctx} ${err.type} ${err.at}` : null,
    ].filter((l) => l != null).join('\n')
  })
  const copy = () => { navigator.clipboard?.writeText(text); toast(t('err_copied')) }
  return (
    <Sheet title={t('more_report')} onClose={onClose}>
      <label htmlFor="report" className="small">{t('report_hint')}</label>
      <textarea id="report" className="report-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" className="btn" onClick={copy}>{t('report_copy')}</button>
      <button type="button" className="btn ghost" onClick={onClose}>{t('manage_cancel')}</button>
    </Sheet>
  )
}
