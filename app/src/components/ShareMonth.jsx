// Share your month (v1.3.0): the sheet with the month image, the Share button (+30 XP) and the privacy note. The image
// is drawn by lib/poster.js (totals only, fixed dark colours in both themes); sharing routes through App's shareMonth,
// which uses the same confirm step as a badge and grants +30 XP once a calendar month.
import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Sheet } from './ui.jsx'
import { listGoals } from '../lib/goals.js'
import { monthShareStats } from '../lib/insights.js'
import { drawMonthPoster } from '../lib/poster.js'
import { goalBrand } from '../screens/Home.jsx'

// The month name in the app's language (Intl gives lowercase in fr and es, capitalised in en, which the button wants).
export const monthName = (now, lang) => { try { return new Date(now).toLocaleDateString(lang, { month: 'long' }) } catch { return '' } }
export const monthLabel = (now, lang) => { try { return new Date(now).toLocaleDateString(lang, { month: 'long', year: 'numeric' }) } catch { return '' } }

// The brand logos of the goals that saved this month (the image never carries a name). Official logo files only; a
// letter tile for brands that ship no logo.
export function monthLogos(goals, stats) {
  return stats.goalIds
    .map((id) => goals.find((g) => g.id === id))
    .filter(Boolean)
    .map((g) => {
      const b = goalBrand(g)
      return b.logo
        ? { logo: b.logo }
        : { bg: b.tile?.bg || (b.color && b.color[0]) || '#35323f', fg: b.tile?.fg || '#ffffff', letter: b.tile?.letter || String(b.name || '?')[0] }
    })
}

export default function ShareMonth({ onClose }) {
  const { t, lang, address, shareMonth } = useApp()
  const now = Date.now()
  const goals = listGoals(address)
  const stats = monthShareStats(goals, now)
  const label = monthLabel(now, lang)
  const logos = monthLogos(goals, stats)
  const [url, setUrl] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    let obj = null
    drawMonthPoster({ stats, monthLabel: label, logos, t, lang })
      .then((blob) => { if (live) { obj = URL.createObjectURL(blob); setUrl(obj) } })
      .catch(() => { /* the share still works without the preview */ })
    return () => { live = false; if (obj) URL.revokeObjectURL(obj) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const doShare = async () => {
    if (busy) return
    setBusy(true)
    try { await shareMonth({ stats, monthLabel: label, logos }) } finally { setBusy(false); onClose() }
  }

  return (
    <Sheet title={t('share_month_title')} onClose={onClose}>
      <div className="sm-img">{url ? <img src={url} alt="" /> : <div className="sm-ph" aria-hidden="true" />}</div>
      <button type="button" className="btn" disabled={busy} onClick={doShare}>{t('share_month_go')}</button>
      <p className="small sm-note">{t('share_month_note')}</p>
    </Sheet>
  )
}
