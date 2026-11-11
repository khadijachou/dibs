import { useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, LangSwitch } from '../components/ui.jsx'
import { StatsSetting } from '../components/StatsConsent.jsx'
import { useFullscreen } from '../lib/fullscreen.js'
import FullscreenSheet from '../components/FullscreenSheet.jsx'
import { audioContext, playTing } from '../lib/sound.js'

// Sound is on unless the user turned it off: dibs.sound missing (a new user) = on, as in lib/sound.js.
const soundOn = () => { try { return localStorage.getItem('dibs.sound') !== 'off' } catch { return true } }

// More > Preferences: language, sound (with a test sound), full screen where Nimiq Pay supports it, and the anonymous
// usage stats (with Delete what was shared). Same behaviour as when these sat in More.
export default function Preferences() {
  const { t, back, canGoBack } = useApp()
  const [sound, setSound] = useState(soundOn)
  const fs = useFullscreen()
  const [fsAsk, setFsAsk] = useState(false)
  const toggleSound = () => {
    const next = !sound
    try { localStorage.setItem('dibs.sound', next ? 'on' : 'off') } catch { /* private mode */ }
    setSound(next)
  }
  return (
    <>
      <Header onBack={canGoBack ? back : undefined} />
      <main className="screen">
        <h2 className="title">{t('prefs_title')}</h2>
        <section className="more-sec">
          <div className="set-row"><span>{t('lang_label')}</span><LangSwitch /></div>
          <div className="set-row">
            <span>{t('more_sound')}</span>
            <button type="button" role="switch" aria-checked={sound} aria-label={t('more_sound')} className={`switch${sound ? ' on' : ''}`} onClick={toggleSound}><i /></button>
          </div>
          {/* From the tap: audioContext() creates or resumes the shared context, then the ting plays on it. */}
          {sound && <button type="button" className="txt-link sound-test" onClick={() => { audioContext(); playTing() }}>{t('sound_test')}</button>}
          {fs.supported && (fs.on ? (
            <button type="button" className="set-row fs-row" onClick={fs.leave}>
              <span><b>{t('fs_row_on')}</b></span>
            </button>
          ) : (
            <button type="button" className="set-row fs-row" onClick={() => setFsAsk(true)}>
              <span><b>{t('fs_row')}</b><small>{t('fs_row_sub')}</small></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
          ))}
          {fsAsk && <FullscreenSheet onClose={() => setFsAsk(false)} />}
          <StatsSetting />
        </section>
        <p className="small">{t('prefs_foot')}</p>
      </main>
    </>
  )
}
