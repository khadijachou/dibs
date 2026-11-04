import { useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Icon } from '../components/ui.jsx'
import { getCatalog } from '../lib/catalog.js'
import { fmtUsd } from '../lib/format.js'

export default function Catalog() {
  const { t, lang, go, back, canGoBack } = useApp()
  const CATALOG = getCatalog()
  const [picked, setPicked] = useState(CATALOG[0].id)
  const item = CATALOG.find((i) => i.id === picked)

  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <div>
          <p className="small" style={{ fontWeight: 600, color: 'var(--gold)' }}>{t('tagline')}</p>
          <h2 className="title">{t('catalog_title')}</h2>
          <p className="sub" style={{ marginTop: 6 }}>{t('catalog_sub')}</p>
        </div>
        <div className="grid">
          {CATALOG.map((i) => (
            <button type="button" key={i.id} className={`tile${i.id === picked ? ' on' : ''}`} aria-pressed={i.id === picked} onClick={() => setPicked(i.id)}>
              <div className="ico"><Icon name={i.icon} /></div>
              <b>{i.name}</b>
              <span>{i.detail} · {fmtUsd(i.usd, lang)} USD</span>
            </button>
          ))}
        </div>
        <div className="bottom">
          <p className="small center">{t('catalog_footer')}</p>
          <button type="button" className="btn" onClick={() => go('plan', { itemId: picked })}>{t('catalog_cta', { name: item.name })}</button>
        </div>
      </main>
    </>
  )
}
