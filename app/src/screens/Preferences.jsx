import { useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Icon, LangSwitch, useCurrencyChoice } from '../components/ui.jsx'
import { StatsSetting } from '../components/StatsConsent.jsx'
import { audioContext, playTing } from '../lib/sound.js'
import { getThemeChoice, setTheme, THEMES } from '../lib/theme.js'
import { CURRENCIES, setCurrency } from '../lib/currency.js'
import { enabled as friendsEnabled, isOn as friendsIsOn, getVis as friendsVis, visSummary } from '../lib/friends.js'

// Sound is on unless the user turned it off: dibs.sound missing (a new user) = on, as in lib/sound.js.
const soundOn = () => { try { return localStorage.getItem('dibs.sound') !== 'off' } catch { return true } }

// A half-filled circle for Auto (the Icon set has no such glyph): a plain inline SVG, like the others in ui.jsx.
const AutoThemeIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
  </svg>
)
// The same icons the old header toggle used: sun for Light, moon for Dark, the half circle for Auto.
const THEME_ICON = { dark: <Icon name="moon" size={14} stroke={2} />, light: <Icon name="sun" size={14} stroke={2} />, auto: <AutoThemeIcon /> }

// More > Preferences: language, appearance (dark or light, lib/theme.js), currency (lib/currency.js: the header value and
// the card version a brand opens on; applies at once, the header above follows), sound (with a test sound button in its row),
// and Share usage stats. Full screen is the header button only (components/ui.jsx Header).
export default function Preferences() {
  const { t, go, back, canGoBack } = useApp()
  const showWho = friendsEnabled() && friendsIsOn()
  const whoN = visSummary(friendsVis()).n
  const [sound, setSound] = useState(soundOn)
  const [theme, setThemeState] = useState(getThemeChoice) // the stored choice: 'dark', 'light' or 'auto'
  const currency = useCurrencyChoice()
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
          <div className="set-row set-col">
            <span><b>{t('prefs_theme')}</b><small>{t('prefs_theme_sub')}</small></span>
            <div className="lang-seg seg-full seg-icons" role="group" aria-label={t('prefs_theme')}>
              {THEMES.map((th) => (
                <button type="button" key={th} aria-pressed={th === theme} className={th === theme ? 'on' : ''}
                  onClick={() => { setTheme(th); setThemeState(th) }}><span className="seg-ico" aria-hidden="true">{THEME_ICON[th]}</span>{t(`theme_${th}`)}</button>
              ))}
            </div>
          </div>
          <div className="set-row set-col">
            <span><b>{t('prefs_currency')}</b><small>{t('prefs_currency_sub')}</small></span>
            <div className="lang-seg seg-full" role="group" aria-label={t('prefs_currency')}>
              {CURRENCIES.map((c) => (
                <button type="button" key={c} aria-pressed={c === currency} className={c === currency ? 'on' : ''}
                  onClick={() => setCurrency(c)}>{c === 'auto' ? t('currency_auto') : c}</button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <span>{t('more_sound')}</span>
            <span className="sound-ctl">
              {/* From the tap: audioContext() creates or resumes the shared context, then the ting plays on it. */}
              {sound && <button type="button" className="sound-test" aria-label={t('sound_test')} onClick={() => { audioContext(); playTing() }}><Icon name="speaker" size={18} /></button>}
              <button type="button" role="switch" aria-checked={sound} aria-label={t('more_sound')} className={`switch${sound ? ' on' : ''}`} onClick={toggleSound}><i /></button>
            </span>
          </div>
          <StatsSetting />
          {showWho && (
            <button type="button" className="set-row stats-row row-link" onClick={() => go('friendProfile', { me: true })}>
              <span><b>{t('frd_who')}</b><small>{t('pref_who_sub')}</small></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
          )}
        </section>
      </main>
    </>
  )
}
