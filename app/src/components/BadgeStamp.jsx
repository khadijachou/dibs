import { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Medal } from './Badge.jsx'

// "Badge earned" band: one new badge at a time, 4 s, fixed under the header. Tap opens Profile on that badge's sheet;
// Share shares it on X. Never shown over a Nimiq Pay request: while one is open (blockBack), it waits and shows later.
const SHOW_MS = 4000

export default function BadgeStamp({ id, isBlocked, onDone }) {
  const { t, go, shareBadge } = useApp()
  const [shown, setShown] = useState(null)

  useEffect(() => {
    if (!id) return undefined
    let timer
    const tryShow = () => {
      if (isBlocked()) { timer = setTimeout(tryShow, 1000); return }
      setShown(id)
      timer = setTimeout(() => { setShown(null); onDone() }, SHOW_MS)
    }
    tryShow()
    return () => clearTimeout(timer)
  }, [id, isBlocked, onDone])

  const close = () => { setShown(null); onDone() }
  const open = () => { const b = shown; close(); go('profile', { badge: b, badgeAt: Date.now() }) }
  const share = () => { const b = shown; close(); shareBadge(b) }

  return (
    <div className="bstamp-live" aria-live="polite">
      {shown && (
        <div className="bstamp" key={shown}>
          <button type="button" className="bstamp-main" onClick={open}>
            <Medal id={shown} earned size={40} />
            <span className="bstamp-txt"><small>{t('badge_stamp')}</small><b>{t(`badge_${shown}`)}</b></span>
          </button>
          <button type="button" className="bstamp-share" onClick={share}>{t('badge_stamp_share')}</button>
        </div>
      )}
    </div>
  )
}
