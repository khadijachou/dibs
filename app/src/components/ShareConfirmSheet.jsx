import { useApp } from '../App.jsx'
import { Sheet } from './ui.jsx'

// After Share on X ('shared' or 'fallback'): Spread the word and its XP count only once the user says the post is up.
// onYes records it; Not yet or closing the sheet records nothing.
export default function ShareConfirmSheet({ onYes, onClose }) {
  const { t } = useApp()
  return (
    <Sheet title={t('share_confirm_title')} onClose={onClose}>
      <p className="small">{t('share_confirm_body')}</p>
      <button type="button" className="btn" onClick={onYes}>{t('share_confirm_yes')}</button>
      <button type="button" className="btn ghost" onClick={onClose}>{t('share_confirm_no')}</button>
    </Sheet>
  )
}
