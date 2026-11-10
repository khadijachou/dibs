import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Medal } from './Badge.jsx'

// "Badge earned" band: one new badge at a time, 4 s, fixed under the header. Tap (or Share) opens Profile on that
// badge's sheet, where the share hint is. Never shown over a Nimiq Pay request (blockBack) nor over the "Dibs!" stamp
// (components/ui.jsx Stamp, 2 s): it waits and shows after them.
const SHOW_MS = 4000
const FIRST_LOOK_MS = 400 // a "Dibs!" stamp that is mounting right now is seen at the first check
const dibsStampOn = () => Boolean(document.querySelector('.stamp'))

export default function BadgeStamp({ id, isBlocked, onDone }) {
  const { t, go } = useApp()
  const [shown, setShown] = useState(null)

  useEffect(() => {
    if (!id) return undefined
    let timer
    const tryShow = () => {
      if (isBlocked()) { timer = setTimeout(tryShow, 1000); return }
      if (dibsStampOn()) { timer = setTimeout(tryShow, 250); return }
      setShown(id)
      timer = setTimeout(() => { setShown(null); onDone() }, SHOW_MS)
    }
    timer = setTimeout(tryShow, FIRST_LOOK_MS)
    return () => clearTimeout(timer)
  }, [id, isBlocked, onDone])

  const close = () => { setShown(null); onDone() }
  const open = () => { const b = shown; close(); go('profile', { badge: b, badgeAt: Date.now() }) }

  return (
    <div className="bstamp-live" aria-live="polite">
      {shown && (
        <div className="bstamp" key={shown}>
          <button type="button" className="bstamp-main" onClick={open}>
            <Medal id={shown} earned size={40} />
            <span className="bstamp-txt"><small>{t('badge_stamp')}</small><b>{t(`badge_${shown}`)}</b></span>
          </button>
          <button type="button" className="bstamp-share" onClick={open}>{t('badge_stamp_share')}</button>
        </div>
      )}
    </div>
  )
}
