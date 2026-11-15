import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { Icon } from './ui.jsx'
import { nextFact, DYK_U_COUNT, DYK_C_COUNT } from '../lib/didYouKnow.js'

// A short "Did you know?" line shown while the user waits: list "U" under an unlocking goal's clock, list "C" on the
// code screen while the shop delivers. Display only: no network, no chain read. It picks one fact once per mount and
// keeps it while mounted (no timer, no rotation, no change on re-render). The only saved data is the picker's
// position (dibs.dyk.U / dibs.dyk.C in localStorage).
//
// One visit must advance the position by exactly one. The ref guard keeps nextFact to a single call even when React
// StrictMode runs the mount effect twice in development (same instance, same ref), so dev and the production build
// both advance once.
export default function DidYouKnow({ list }) {
  const { t } = useApp()
  const count = list === 'C' ? DYK_C_COUNT : DYK_U_COUNT
  const prefix = list === 'C' ? 'dyk_c' : 'dyk_u'
  const [idx, setIdx] = useState(-1)
  const picked = useRef(false)
  useEffect(() => {
    if (picked.current) return
    picked.current = true
    setIdx(nextFact(list, count))
  }, [list, count])

  if (idx < 0) return null
  const label = t('dyk_label')
  const fact = t(`${prefix}${idx + 1}`)
  return (
    <div className="dyk">
      <span className="dyk-tile" aria-hidden="true"><Icon name="bulb" size={16} stroke={2} /></span>
      <div className="dyk-txt">
        <div className="dyk-label">{label}</div>
        <div className="dyk-fact">{fact}</div>
      </div>
    </div>
  )
}
