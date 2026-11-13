import { useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Header } from '../components/ui.jsx'
import { BRANDS, catalogBrands, filterBrands, prefBrands, worksText } from '../lib/brands.js'
import { readPrefs, removePref, setPref } from '../lib/prefs.js'
import BrandSheet, { RegionMissing } from '../components/BrandSheet.jsx'
import { BrandChips, BrandSearch } from './Catalog.jsx'

// A saved brand, from the live catalogue (logo, versions, works-with lines), else from the static list.
const brandFor = (key, brands) => brands.find((b) => b.key === key) || BRANDS.find((b) => b.key === key) || { key, name: key }

// More > Your accounts: the card version saved for each brand (lib/prefs.js). Change opens the version step.
export default function Accounts() {
  const { t, go, back, canGoBack } = useApp()
  const [prefs, setPrefs] = useState(readPrefs)
  const [edit, setEdit] = useState(null) // brand key whose version step is open
  const brands = catalogBrands()
  const order = (k) => { const i = brands.findIndex((b) => b.key === k); return i < 0 ? 99 : i }
  const rows = Object.entries(prefs).sort(([a], [b]) => order(a) - order(b)).map(([key, version]) => {
    const brand = brandFor(key, brands)
    const works = brand.regions?.find((r) => r.key === version)?.worksWith || null
    return { key, version, brand, works }
  })
  const editBrand = edit ? brands.find((b) => b.key === edit) : null
  const close = () => { setEdit(null); setPrefs(readPrefs()) }
  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <div>
          <h2 className="title">{t('accounts_title')}</h2>
          <p className="sub" style={{ marginTop: 6 }}>{t('accounts_lead')}</p>
        </div>
        {rows.length > 0 && (
          <div className="acc-list">
            {rows.map((r) => (
              <div className="acc-row" key={r.key}>
                <BrandLogo brand={r.brand} />
                <div className="acc-main"><b>{r.brand.name}</b>{r.works && <small>{worksText(t, r.works)}</small>}</div>
                <span className="acc-pill">{t(`region_${r.version}`)}</span>
                {r.brand.regions?.length > 0 && <button type="button" className="acc-change" onClick={() => setEdit(r.key)}>{t('accounts_change')}</button>}
              </div>
            ))}
          </div>
        )}
        <button type="button" className="btn outline" onClick={() => go('prefAdd')}>{t('accounts_add')}</button>
        <RegionMissing card />
      </main>
      {editBrand && (
        <BrandSheet brand={editBrand} pref onClose={close}
          onSave={(v) => { setPref(editBrand.key, v); close() }}
          onRemove={() => { removePref(editBrand.key); close() }} />
      )}
    </>
  )
}

// Your accounts > Add a preference: brands sold in more than one version, with the catalogue's search and chips.
export function AddPreference() {
  const { t, back, canGoBack } = useApp()
  const [prefs, setPrefs] = useState(readPrefs)
  const [q, setQ] = useState('')
  const [chip, setChip] = useState('all')
  const [open, setOpen] = useState(null)
  const list = prefBrands(catalogBrands(), prefs)
  const listBrands = list.map((r) => r.brand)
  const shownKeys = new Set(filterBrands(listBrands, { q, chip }).map((b) => b.key))
  const shown = list.filter((r) => shownKeys.has(r.brand.key))
  const openBrand = open ? listBrands.find((b) => b.key === open) : null
  const close = () => { setOpen(null); setPrefs(readPrefs()) }
  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <div>
          <h2 className="title">{t('pref_add_title')}</h2>
          <p className="sub" style={{ marginTop: 6 }}>{t('pref_add_lead')}</p>
        </div>
        <BrandSearch brands={listBrands} q={q} onQ={setQ} />
        <BrandChips brands={listBrands} chip={chip} onChip={setChip} />
        {shown.length === 0 ? (
          <p className="small center cat-none">{t('cat_none', { q: q.trim() })}</p>
        ) : (
          <div className="acc-list">
            {shown.map((r) => (
              <button type="button" className="sheet-row acc-pick" key={r.brand.key} aria-haspopup="dialog" onClick={() => setOpen(r.brand.key)}>
                <BrandLogo brand={r.brand} />
                <span>
                  <b>{r.brand.name}</b>
                  <small>{r.versions.map((v) => t(`region_${v}`)).join(' · ')}</small>
                  {r.saved && <span className="pref-tag">{t('pref_saved_tag', { version: t(`region_${r.saved}`) })}</span>}
                </span>
                <span className="chev" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        )}
        <p className="small">{t('pref_add_foot')}</p>
      </main>
      {openBrand && (
        <BrandSheet brand={openBrand} pref onClose={close}
          onSave={(v) => { setPref(openBrand.key, v); setOpen(null); back() }}
          onRemove={() => { removePref(openBrand.key); close() }} />
      )}
    </>
  )
}
