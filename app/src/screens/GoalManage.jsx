import { useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, FieldError, Sheet } from '../components/ui.jsx'
import { listGoals, moveNim, progress, removeGoal, savedNim } from '../lib/goals.js'
import { goalBrand } from './Home.jsx'
import { fmtNim } from '../lib/format.js'

const parseNim = (v) => Math.floor(Number(String(v).replace(/[^\d.]/g, ''))) || 0
export const goalLabel = (g) => `${g.itemName} · ${g.itemDetail}`

// Frame 2: Move, Get my NIM back, Delete (off while the goal still holds NIM).
export function ManageSheet({ goal, onClose, onMove, onWithdraw, onDelete }) {
  const { t, lang } = useApp()
  const saved = savedNim(goal)
  return (
    <Sheet title={t('manage_title')} onClose={onClose}>
      <div className="sheet-list">
        <button type="button" className="sheet-row" disabled={saved <= 0} onClick={onMove}>
          <span className="si move" aria-hidden="true">⇄</span>
          <span><b>{t('manage_move')}</b><small>{t('manage_move_sub')}</small></span>
        </button>
        <button type="button" className="sheet-row" disabled={saved <= 0} onClick={onWithdraw}>
          <span className="si back" aria-hidden="true">↩</span>
          <span><b>{t('manage_back')}</b><small>{t('manage_back_sub')}</small></span>
        </button>
        <button type="button" className="sheet-row danger" disabled={saved > 0} onClick={onDelete}>
          <span className="si del" aria-hidden="true">✕</span>
          <span><b>{t('manage_delete')}</b>{saved > 0 && <small>{t('manage_delete_blocked', { nim: fmtNim(saved, lang) })}</small>}</span>
        </button>
      </div>
      <button type="button" className="btn ghost" onClick={onClose}>{t('manage_cancel')}</button>
    </Sheet>
  )
}

// Frame 3: pick a saving goal (or a new one), pick an amount, move. Ledger only, no Nimiq Pay step.
export function MoveSheet({ goal, preselect = null, onClose, onMoved }) {
  const { t, lang, address, go, toast } = useApp()
  const saved = savedNim(goal)
  const targets = listGoals(address).filter((g) => g.id !== goal.id && g.status === 'saving')
  const [to, setTo] = useState(() => (targets.some((g) => g.id === preselect) ? preselect : targets.length === 1 ? targets[0].id : null))
  const [mode, setMode] = useState('all')
  const [other, setOther] = useState('')
  const nim = mode === 'all' ? saved : mode === 'half' ? Math.floor(saved / 2) : parseNim(other)
  const tooMuch = mode === 'other' && nim > saved
  const target = targets.find((g) => g.id === to)
  const ok = target && nim > 0 && !tooMuch

  const move = () => {
    if (!ok) return
    try {
      const r = moveNim(address, goal.id, target.id, nim)
      toast(t('move_done', { nim: fmtNim(nim, lang), name: goalLabel(target) }))
      onMoved(r)
    } catch {
      toast(t('move_fail'))
    }
  }

  return (
    <Sheet title={t('move_title')} onClose={onClose}>
      <p className="small">{t('move_from', { name: goalLabel(goal), nim: fmtNim(saved, lang) })}</p>
      <span className="small sheet-label">{t('move_to')}</span>
      <div className="sheet-list" role="radiogroup" aria-label={t('move_to')}>
        {targets.map((g) => {
          const left = Math.max(0, g.targetNim - savedNim(g))
          return (
            <button type="button" key={g.id} role="radio" aria-checked={g.id === to} className={`sheet-row pick-goal${g.id === to ? ' on' : ''}`} onClick={() => setTo(g.id)}>
              <BrandLogo brand={goalBrand(g)} />
              <span><b>{goalLabel(g)}</b><small>{t('move_goal_meta', { pct: Math.round(progress(g) * 100), nim: fmtNim(left, lang) })}</small></span>
              <span className="radio" aria-hidden="true" />
            </button>
          )
        })}
        <button type="button" className="sheet-row pick-goal new" onClick={() => { onClose(); go('catalog', { moveFrom: goal.id }) }}>
          <span className="si plus" aria-hidden="true">+</span>
          <span><b>{t('move_new')}</b><small>{t('move_new_sub')}</small></span>
        </button>
      </div>
      <span className="small sheet-label">{t('move_amount')}</span>
      <div className="pills" role="group" aria-label={t('move_amount')}>
        {[['all', t('move_all')], ['half', t('move_half')], ['other', t('move_other')]].map(([k, label]) => (
          <button type="button" key={k} className={`pill${mode === k ? ' on' : ''}`} aria-pressed={mode === k} disabled={k === 'half' && saved < 2} onClick={() => setMode(k)}>{label}</button>
        ))}
      </div>
      {mode === 'other' && (
        <>
          <div className={`amount${tooMuch ? ' bad' : ''}`}>
            <input inputMode="numeric" autoFocus aria-label={t('move_amount')} value={other} onChange={(e) => setOther(e.target.value)} placeholder="0" />
            <span>NIM</span>
          </div>
          {tooMuch && <FieldError>{t('move_too_much', { nim: fmtNim(saved, lang) })}</FieldError>}
        </>
      )}
      <button type="button" className="btn tall" disabled={!ok} onClick={move}>
        {target ? t('move_cta', { nim: fmtNim(nim, lang), name: goalLabel(target) }) : t('move_pick')}
        <small>{t('move_cta_sub')}</small>
      </button>
    </Sheet>
  )
}

// Frame 6: confirm, delete, back to Home.
export function DeleteSheet({ goal, onClose }) {
  const { t, address, reset, toast } = useApp()
  const del = () => {
    try {
      removeGoal(address, goal.id)
      toast(t('delete_done'))
      reset('home')
    } catch {
      toast(t('delete_fail'))
      onClose()
    }
  }
  return (
    <Sheet title={t('delete_title', { name: goalLabel(goal) })} onClose={onClose}>
      <p className="small">{t('delete_sub')}</p>
      <button type="button" className="btn danger" onClick={del}>{t('delete_cta')}</button>
      <button type="button" className="btn ghost" onClick={onClose}>{t('manage_cancel')}</button>
    </Sheet>
  )
}
