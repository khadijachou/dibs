// Leaderboards (v1.7): two tabs, Friends and Global, ranked by the XP the server has checked (deposits), this month.
// Reached from Profile. Opt-in: a phone that has not joined sees a quiet join prompt here. Any server failure shows the
// one Friends notice, never a toast elsewhere. No arrows, no "you're behind", no countdown.
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header } from '../components/ui.jsx'
import { Avatar } from '../components/Avatar.jsx'
import { accentClass } from '../components/LookParts.jsx'
import { Skeleton, FriendNotice, JoinBoardsSheet } from '../components/FriendsParts.jsx'
import { rankOf } from '../lib/xp.js'
import {
  getBoardsState, onAnyBoard, friendsBoard, globalBoard, setBoards, refreshBoards, BOARDS_EVENT,
} from '../lib/boards.js'
import { getState as friendsState } from '../lib/friends.js'

const fmtN = (n, lang) => { try { return Number(n || 0).toLocaleString(lang) } catch { return String(n || 0) } }

// Live board membership ({ friends, global }), re-read on the boards event (join, leave).
function useBoardsState() {
  const [s, setS] = useState(() => getBoardsState())
  useEffect(() => {
    const on = () => setS(getBoardsState())
    window.addEventListener(BOARDS_EVENT, on)
    return () => window.removeEventListener(BOARDS_EVENT, on)
  }, [])
  return s
}

// One row: place, avatar (identicon from the id; the rank frame on Friends), name (its accent on Friends), the level
// line when present, and the XP. isMe gives it the coral "(you)" treatment.
function Row({ r, isMe, tab, hidePlace }) {
  const { t, lang } = useApp()
  const isFriends = tab === 'friends'
  const sub = r.level != null ? t('frd_level_rank', { n: r.level, rank: t(`rank_${rankOf(r.level).id}`) }) : null
  return (
    <div className={`brd-row${isMe ? ' me' : ''}`}>
      {!hidePlace && <span className="brd-place">{r.place}</span>}
      <Avatar seed={r.id} size={40} className="frd-av" frame={isFriends ? r.look?.frame : null} />
      <span className="frd-row-mid">
        <b className={isFriends ? accentClass(r.look?.accent) : undefined}>{r.name}{isMe && <span className="brd-you"> {t('board_you')}</span>}</b>
        {sub && <small>{sub}</small>}
      </span>
      <span className="brd-xp">{t('board_xp', { xp: fmtN(r.xp, lang) })}</span>
    </div>
  )
}

export default function Boards() {
  const { t, lang, go, back } = useApp()
  const st = useBoardsState()
  const joined = onAnyBoard()
  const [tab, setTab] = useState('friends')
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [joinOpen, setJoinOpen] = useState(false)

  useEffect(() => { refreshBoards() }, [])

  const load = useCallback((which) => {
    setLoading(true); setErr(false); setData(null)
    const call = which === 'global' ? globalBoard : friendsBoard
    return call().then((d) => { setData(d); setLoading(false) }).catch(() => { setErr(true); setLoading(false) })
  }, [])
  useEffect(() => { if (joined) load(tab) }, [tab, joined, load])

  // Not joined: a quiet join prompt (the row still brings people here).
  if (!joined) {
    return (
      <>
        <Header onBack={back} />
        <main className="screen">
          <h2 className="title">{t('board_title')}</h2>
          <section className="card brd-join-card">
            <b>{t('board_card_title')}</b>
            <p className="small">{t('board_card_body')}</p>
            <button type="button" className="btn" onClick={() => setJoinOpen(true)}>{t('board_card_join')}</button>
          </section>
        </main>
        {joinOpen && <JoinBoardsSheet onClose={() => setJoinOpen(false)} onJoined={() => setJoinOpen(false)} />}
      </>
    )
  }

  const myId = friendsState()?.id || null
  const needFriends = tab === 'friends' && data && data.needFriends
  const count = data?.count
  const rows = tab === 'friends' ? (data?.rows || []) : (data?.top || [])
  // Global: my row is pinned under the top 5 with a gap, unless I am already in the top 5.
  const meInTop = tab === 'global' && data?.me && rows.some((r) => r.id === data.me.id)
  const meRow = tab === 'global' && data?.me && !meInTop ? data.me : null
  // Everyone on the board still at 0 checked XP: the place numbers (all 1) say nothing, so hide them and show one line.
  const allZero = (() => { const all = meRow ? [...rows, meRow] : rows; return all.length > 0 && all.every((r) => !r.xp) })()
  const countStr = count != null
    ? (tab === 'global'
      ? t(count === 1 ? 'board_count_global_one' : 'board_count_global', { n: fmtN(count, lang) })
      : t(count === 1 ? 'board_count_friends_one' : 'board_count_friends', { n: fmtN(count, lang) }))
    : null
  const meta = countStr ? `${t('board_meta_month')} · ${countStr}` : t('board_meta_month')

  const leave = async (which, on) => {
    const next = { friends: st?.friends || false, global: st?.global || false, [which]: on }
    try { await setBoards(next); if (!next.friends && !next.global) back() } catch { /* quiet */ }
  }

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <h2 className="title">{t('board_title')}</h2>
        <div className="brd-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'friends'} className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>{t('board_tab_friends')}</button>
          <button type="button" role="tab" aria-selected={tab === 'global'} className={tab === 'global' ? 'on' : ''} onClick={() => setTab('global')}>{t('board_tab_global')}</button>
        </div>

        {!needFriends && <p className="brd-meta">{meta}</p>}

        {loading && <Skeleton rows={4} />}
        {err && <FriendNotice onRetry={() => load(tab)} />}

        {!loading && !err && needFriends && (
          <section className="brd-need">
            <b>{t('board_need_title')}</b>
            <p className="small">{data.friends === 1 ? t('board_need_sub_one') : data.friends === 0 ? t('board_need_sub_zero') : t('board_need_sub', { n: data.friends })}</p>
            <div className="frd-invite-btns">
              <button type="button" className="btn" onClick={() => go('friends')}>{t('board_invite')}</button>
              <button type="button" className="btn ghost" onClick={() => setTab('global')}>{t('board_see_global')}</button>
            </div>
          </section>
        )}

        {!loading && !err && !needFriends && (
          <>
            {allZero && <p className="brd-allzero">{t('board_all_zero')}</p>}
            <section className="brd-list">
              {rows.map((r) => <Row key={r.id} r={r} isMe={r.id === myId} tab={tab} hidePlace={allZero} />)}
              {meRow && (
                <>
                  <div className="brd-gap" aria-hidden="true">· · ·</div>
                  <Row r={meRow} isMe tab={tab} hidePlace={allZero} />
                </>
              )}
            </section>
            <p className="brd-note">{t('board_note')}</p>
          </>
        )}

        <section className="brd-leave">
          <div className="brd-sw-row">
            <span className="frd-row-mid"><b>{t('board_sw_friends')}</b></span>
            <button type="button" role="switch" aria-checked={Boolean(st?.friends)} aria-label={t('board_sw_friends')} className={`switch${st?.friends ? ' on' : ''}`} onClick={() => leave('friends', !st?.friends)}><i /></button>
          </div>
          <div className="brd-sw-row">
            <span className="frd-row-mid"><b>{t('board_sw_global')}</b></span>
            <button type="button" role="switch" aria-checked={Boolean(st?.global)} aria-label={t('board_sw_global')} className={`switch${st?.global ? ' on' : ''}`} onClick={() => leave('global', !st?.global)}><i /></button>
          </div>
        </section>
      </main>
    </>
  )
}
