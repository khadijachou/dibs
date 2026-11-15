import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { BrandLogo, Sheet } from './ui.jsx'
import { listGoals, keepInWallet } from '../lib/goals.js'
import { eligible, pickState, toggle, writes } from '../lib/keepPick.js'
import { goalBrand } from '../screens/Home.jsx'
import { goalShortName } from './WeekCard.jsx'
import { fmtNim } from '../lib/format.js'

// Keep it in my wallet (v1.2.11). The other answer to a Savings gap: instead of staking the missing NIM again
// (components/Restake.jsx), the user keeps it in the wallet and picks the goal (or goals) that stop counting it. Ledger
// only: lib/goals.js keepInWallet writes one negative 'kept' entry per picked goal. No transaction, no server, no stats.

// A quiet link under the gap band. Hidden when no saving goal holds NIM (nothing could stop counting it).
export function KeepLink({ gap }) {
  const { t, address } = useApp()
  const [open, setOpen] = useState(false)
  if (!eligible(listGoals(address)).length) return null
  return (
    <>
      <button type="button" className="keep-link" onClick={() => setOpen(true)}>{t('keep_link')}</button>
      {open && <KeepSheet gap={gap} onClose={() => setOpen(false)} />}
    </>
  )
}

// Pick the goal (or goals) that stop counting the gap. The write (keepInWallet) fires dibs:goals, so Savings recomputes.
export function KeepSheet({ gap, onClose }) {
  const { t, lang, address, toast } = useApp()
  const goals = listGoals(address)
  const list = eligible(goals)
  const single = list.length === 1
  const [picked, setPicked] = useState([])
  const state = pickState({ goals, gap, picked })
  const rootRef = useRef(null)
  useEffect(() => { (rootRef.current?.querySelector('button:not([disabled])'))?.focus() }, [])

  const goalOf = (id) => list.find((g) => g.id === id)
  const pickedRows = state.rows.filter((r) => r.picked)
  const canDo = state.covered || (single && state.total > 0)
  const title = t('keep_title', { n: fmtNim(gap, lang) })

  const confirm = () => {
    const w = writes(state)
    if (!canDo || !w.length) return
    try {
      keepInWallet(address, w)
      onClose()
      toast(t('keep_done', { n: fmtNim(state.total, lang) }))
    } catch { /* refused: the ledger is unchanged, leave the sheet open */ }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div ref={rootRef}>
        <p className="small keep-sub">{t('keep_sub')}</p>
        <div className="sheet-list keep-list" role="group" aria-label={title}>
          {state.rows.map((r) => {
            const g = goalOf(r.id)
            return (
              <button type="button" key={r.id} role="checkbox" aria-checked={r.picked}
                className={`sheet-row keep-row${r.picked ? ' on' : ''}`} disabled={single}
                onClick={() => !single && setPicked((p) => toggle(p, r.id))}>
                <BrandLogo brand={goalBrand(g)} />
                <span className="keep-main">
                  <b>{goalShortName(t, g)}</b>
                  {r.picked ? (
                    <small>
                      <s>{fmtNim(r.saved, lang)}</s> → <span className="keep-new">{fmtNim(r.after, lang)}</span> NIM
                      {' · '}<s>{r.pct}%</s> → <span className="keep-new">{r.pctAfter}%</span>
                      {r.all && <> · {t('keep_all')}</>}
                    </small>
                  ) : (
                    <small>{fmtNim(r.saved, lang)} NIM · {r.pct}%</small>
                  )}
                </span>
                {!single && <span className="radio" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        {state.rest > 0 && <p className="keep-rest">{t('keep_rest', { n: fmtNim(state.rest, lang) })}</p>}
        {state.covered && pickedRows.length === 1 && (
          <p className="small keep-summary">{t('keep_summary', { goal: goalShortName(t, goalOf(pickedRows[0].id)), n: fmtNim(pickedRows[0].after, lang) })}</p>
        )}
        <button type="button" className="btn keep-btn" disabled={!canDo} onClick={confirm}>
          {canDo ? t('keep_btn', { n: fmtNim(state.total, lang) }) : t('keep_btn_choose', { n: fmtNim(state.rest, lang) })}
        </button>
        <p className="small keep-note">{t('keep_note')}</p>
      </div>
    </Sheet>
  )
}
