import { useApp } from '../App.jsx'
import { useFullscreen } from '../lib/fullscreen.js'
import { Sheet } from './ui.jsx'

// Asked before every full screen request: Nimiq Pay shows no prompt of its own (SDK rule).
// Leaving needs no sheet: the More row calls leave() directly, and Nimiq Pay has its own exit button.
export default function FullscreenSheet({ onClose }) {
  const { t, toast } = useApp()
  const { enter } = useFullscreen()
  const go = async () => {
    const ok = await enter()
    onClose()
    if (!ok) toast(t('fs_failed'))
  }
  return (
    <Sheet title={t('fs_title')} onClose={onClose}>
      <p className="small">{t('fs_body')}</p>
      <button type="button" className="btn" onClick={go}>{t('fs_go')}</button>
      <button type="button" className="btn ghost" onClick={onClose}>{t('fs_not_now')}</button>
    </Sheet>
  )
}
