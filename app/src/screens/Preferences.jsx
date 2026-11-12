import { useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, LangSwitch } from '../components/ui.jsx'
import { StatsSetting } from '../components/StatsConsent.jsx'
import { audioContext, playTing } from '../lib/sound.js'
import { getTheme, setTheme, THEMES } from '../lib/theme.js'

// Sound is on unless the user turned it off: dibs.sound missing (a new user) = on, as in lib/sound.js.
const soundOn = () => { try { return localStorage.getItem('dibs.sound') !== 'off' } catch { return true } }

// More > Preferences: language, appearance (dark or light, lib/theme.js), sound (with a test sound), and the anonymous usage
// stats (with Delete what was shared). Full screen is the header button only (components/ui.jsx Header).
export default function Preferences() {
  const { t, back, canGoBack } = useApp()
  const [sound, setSound] = useState(soundOn)
  const [theme, setThemeState] = useState(getTheme)
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
            <span>{t('prefs_theme')}</span>
            <div className="lang-seg" role="group" aria-label={t('prefs_theme')}>
              {THEMES.map((th) => (
                <button type="button" key={th} aria-pressed={th === theme} className={th === theme ? 'on' : ''}
                  onClick={() => setThemeState(setTheme(th))}>{t(`theme_${th}`)}</button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <span>{t('more_sound')}</span>
            <button type="button" role="switch" aria-checked={sound} aria-label={t('more_sound')} className={`switch${sound ? ' on' : ''}`} onClick={toggleSound}><i /></button>
          </div>
          {/* From the tap: audioContext() creates or resumes the shared context, then the ting plays on it. */}
          {sound && <button type="button" className="txt-link sound-test" onClick={() => { audioContext(); playTing() }}>{t('sound_test')}</button>}
          <StatsSetting />
        </section>
        <p className="small">{t('prefs_foot')}</p>
      </main>
    </>
  )
}
