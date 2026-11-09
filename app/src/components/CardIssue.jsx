import { useApp } from '../App.jsx'
import { Notice } from './ui.jsx'
import { getGoal, savedNim, updateGoal } from '../lib/goals.js'
import { goalCardIssue, payLockedFor, readyReturnPatch } from '../lib/availability.js'
import { fmtNim } from '../lib/format.js'

// "This card isn't available right now." on the goal card, the goal screen and at checkout, with two ways out:
//   Change card     → catalogue in change mode (Catalog changeFor → Plan), no transaction, NIM and history kept
//   Get my NIM back → the existing withdraw flow (Unlock mode 'withdraw'); a goal already unlocked (ready) has its NIM
//                     in the wallet, so it is only recorded as returned, exactly as the end of a withdraw does.
// Never blocks or changes the saved NIM. force: show even when the catalogue check says ok (the shop refused at checkout).
export function CardIssue({ goal, force = false }) {
  const { t, lang, address, go, reset, toast } = useApp()
  if (!goal || (!force && !goalCardIssue(goal))) return null
  const saved = savedNim(goal)
  const locked = payLockedFor(goal.id) // a payment with an unknown outcome must settle first
  const getBack = () => {
    if (goal.status === 'ready') {
      const g = getGoal(address, goal.id)
      updateGoal(address, goal.id, readyReturnPatch(g, savedNim(g)))
      toast(t('withdraw_done', { nim: fmtNim(saved, lang) }))
      reset('home')
    } else {
      go('unlock', { goalId: goal.id, mode: 'withdraw' })
    }
  }
  const actions = []
  if (!locked) actions.push({ label: t('avail_change'), onClick: () => go('catalog', { changeFor: goal.id }) })
  if (!locked && saved > 0) actions.push({ label: t('manage_back'), onClick: getBack })
  return <Notice tone="info" title={t('avail_title')} sub={t('avail_sub')} actions={actions} />
}
