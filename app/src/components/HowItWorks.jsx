import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import HowSteps from './HowSteps.jsx'

// First run only, right after "Welcome, {name}": How Dibs works as a pop-up. "Got it" closes it and it never
// shows again (dibs.introSeen).
const OUT_MS = 300

export default function HowItWorks({ onDone }) {
  const { t } = useApp()
  const [out, setOut] = useState(false)
  const done = useRef(onDone)
  const btn = useRef(null)
  useEffect(() => { btn.current?.focus({ preventScroll: true }) }, [])
  const close = () => {
    if (out) return
    try { localStorage.setItem('dibs.introSeen', '1') } catch { /* private mode */ }
    setOut(true)
    setTimeout(() => done.current(), OUT_MS)
  }
  return (
    <div className={`hiw${out ? ' out' : ''}`} role="dialog" aria-modal="true" aria-labelledby="hiw-title">
      <div className="hiw-card">
        <h2 id="hiw-title" className="hiw-title">{t('fs_title')}</h2>
        <HowSteps />
        <button type="button" ref={btn} className="btn" onClick={close}>{t('hiw_cta')}</button>
      </div>
    </div>
  )
}
