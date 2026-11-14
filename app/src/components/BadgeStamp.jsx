import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { HEX, Medal } from './Badge.jsx'
import { playTing } from '../lib/sound.js'

// "Badge earned" band: one new badge at a time, 4 s, fixed under the header. Tap (or Share) opens Profile on that
// badge's sheet, where the share hint is. Never shown over a Nimiq Pay request (blockBack) nor over the "Dibs!" stamp
// (components/ui.jsx Stamp, 2 s): it waits and shows after them.
// On the code screen (screens/Done.jsx) the banner would land on its big "Dibs!" stamp: wait while that screen's
// entrance is playing (.done-screen.done-enter, ~2.4 s), then sit below the hero so the stamp and title stay visible.
// This holds for every badge in the queue (a first purchase can earn two): once on the code screen, always low.
const SHOW_MS = 4000
const FIRST_LOOK_MS = 400 // a "Dibs!" stamp that is mounting right now is seen at the first check
const dibsStampOn = () => Boolean(document.querySelector('.stamp'))
const codeEntranceOn = () => Boolean(document.querySelector('.done-screen.done-enter'))
const onCodeScreen = () => Boolean(document.querySelector('.done-screen'))

export default function BadgeStamp({ id, isBlocked, onDone }) {
  const { t, go } = useApp()
  const [shown, setShown] = useState(null)
  const [low, setLow] = useState(false) // on the code screen: sit below the stamp and title, never over them

  useEffect(() => {
    if (!id) return undefined
    let timer
    const tryShow = () => {
      if (isBlocked()) { timer = setTimeout(tryShow, 1000); return }
      if (dibsStampOn()) { timer = setTimeout(tryShow, 250); return }
      if (codeEntranceOn()) { timer = setTimeout(tryShow, 250); return } // let the code screen entrance settle first
      setLow(onCodeScreen())
      setShown(id)
      playTing()
      timer = setTimeout(() => { setShown(null); onDone() }, SHOW_MS)
    }
    timer = setTimeout(tryShow, FIRST_LOOK_MS)
    return () => clearTimeout(timer)
  }, [id, isBlocked, onDone])

  const close = () => { setShown(null); onDone() }
  // Level items ("lvl:7", queued by App.jsx after any badge): the coral hexagon, no Share (there is no level poster).
  const level = shown?.startsWith('lvl:') ? Number(shown.slice(4)) : null
  const open = () => { const b = shown; close(); go('profile', { badge: b, badgeAt: Date.now() }) }

  return (
    <div className={`bstamp-live${low ? ' bstamp-low' : ''}`} aria-live="polite">
      {shown && (
        <div className="bstamp" key={shown}>
          {level ? (
            <button type="button" className="bstamp-main" onClick={() => { close(); go('profile') }}>
              <span className="lvl-hex bstamp-lvl" aria-hidden="true"><svg viewBox="-1 -1 29 26"><path d={HEX} fill="#E8482A" /></svg><b>{level}</b></span>
              <span className="bstamp-txt"><small>{t('lvl_up_band')}</small><b>{t('level_n', { n: level })}</b></span>
            </button>
          ) : (
            <>
              <button type="button" className="bstamp-main" onClick={open}>
                <Medal id={shown} earned size={40} />
                <span className="bstamp-txt"><small>{t('badge_stamp')}</small><b>{t(`badge_${shown}`)}</b></span>
              </button>
              <button type="button" className="bstamp-share" onClick={open}>{t('badge_stamp_share')}</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
