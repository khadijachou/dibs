// Friends: the invite card (code + share), invites to accept, and the friends list. Reached from Profile when
// Friends is on. Any server failure shows the notice here only (never a toast or banner on other screens).
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { Header, Icon } from '../components/ui.jsx'
import {
  useFriends, PersonRow, Skeleton, FriendNotice, AddByCodeSheet, shareInvite, copyCode,
} from '../components/FriendsParts.jsx'
import { loadFriends, acceptInvite, declineInvite, getPendingCode, setPendingCode, getVis, visSummary } from '../lib/friends.js'

export default function Friends({ addCode }) {
  const { t, go, back, toast } = useApp()
  const st = useFriends()
  // "Who sees what" sub line, re-read on every render (useFriends re-renders on a visibility change).
  const whoN = visSummary(getVis()).n
  const whoSub = whoN === 0 ? t('frd_vis_none') : t('frd_vis_count', { n: whoN })
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [prefill] = useState(() => addCode || getPendingCode() || '') // a ?friend code kept from before turn-on
  const [addOpen, setAddOpen] = useState(Boolean(prefill))
  useEffect(() => { if (prefill) setPendingCode(null) }, [prefill]) // consume it once
  const [acting, setActing] = useState(null) // invite id being accepted/declined

  const load = useCallback(() => {
    setErr(false)
    return loadFriends().then((d) => { setData(d); setLoading(false) }).catch(() => { setErr(true); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  // Friends off (deleted elsewhere, or a 401): leave for Profile.
  useEffect(() => { if (st && !st.on) back() }, [st]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return <><Header onBack={back} /><main className="screen" /></>

  const act = async (fn, id) => { setActing(id); try { await fn(id); await load() } finally { setActing(null) } }
  const invites = data?.invites || []
  const friends = data?.friends || []
  const empty = !loading && !err && !invites.length && !friends.length

  return (
    <>
      <Header onBack={back} />
      <main className="screen">
        <h2 className="title">{t('frd_title')}</h2>

        <section className="card frd-invite">
          <h3>{t('frd_invite_cta')}</h3>
          <p className="small">{t('frd_invite_sub')}</p>
          <button type="button" className="frd-codebox" onClick={() => copyCode(t, st.code, toast)}>
            <b>{st.code}</b><small>{t('frd_your_code')}</small>
          </button>
          <div className="frd-invite-btns">
            <button type="button" className="btn" onClick={() => shareInvite(t, st.code, toast)}>{t('frd_share_link')}</button>
            <button type="button" className="btn ghost" onClick={() => setAddOpen(true)}>{t('frd_add_by_code')}</button>
          </div>
        </section>

        <button type="button" className="frd-prof-row" onClick={() => go('friendProfile', { me: true })}>
          <span className="frd-prof-ic" aria-hidden="true"><Icon name="eye" size={20} /></span>
          <span className="frd-row-mid"><b>{t('frd_who')}</b><small>{whoSub}</small></span>
          <span className="chev" aria-hidden="true">›</span>
        </button>

        {loading && <Skeleton rows={3} />}
        {err && <FriendNotice onRetry={() => { setLoading(true); load() }} />}

        {!loading && !err && (
          <>
            {invites.length > 0 && (
              <section className="frd-sec">
                <h3 className="sec-head-h">{t('frd_invites')}</h3>
                {invites.map((inv) => (
                  <PersonRow key={inv.id} name={inv.from.name} sub={t('frd_wants')}
                    right={(
                      <span className="frd-inv-acts">
                        <button type="button" className="frd-accept" disabled={acting === inv.id} onClick={() => act(acceptInvite, inv.id)}>{t('frd_accept')}</button>
                        <button type="button" className="frd-x" aria-label={t('frd_decline')} disabled={acting === inv.id} onClick={() => act(declineInvite, inv.id)}><Icon name="close" size={18} stroke={2} /></button>
                      </span>
                    )} />
                ))}
              </section>
            )}

            {friends.length > 0 && (
              <section className="frd-sec">
                <h3 className="sec-head-h">{t('frd_friends_n', { n: friends.length })}</h3>
                {friends.map((f) => {
                  const sub = f.level != null ? t('frd_level_rank', { n: f.level, rank: t(`rank_${f.rank}`) }) : f.sharesNothing ? t('frd_shares_nothing') : null
                  return <PersonRow key={f.id} avatar={f.avatar} name={f.name} sub={sub} look={f.look} onClick={() => go('friendProfile', { id: f.id, since: f.since })} right={<span className="chev" aria-hidden="true">›</span>} />
                })}
              </section>
            )}

            {empty && (
              <section className="frd-empty">
                <span className="frd-empty-ic" aria-hidden="true"><Icon name="tabProfile" size={30} /></span>
                <b>{t('frd_empty_title')}</b>
                <p className="small">{t('frd_empty_sub')}</p>
                <div className="frd-invite-btns">
                  <button type="button" className="btn" onClick={() => shareInvite(t, st.code, toast)}>{t('frd_invite_cta')}</button>
                  <button type="button" className="btn ghost" onClick={() => setAddOpen(true)}>{t('frd_add_by_code')}</button>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      {addOpen && <AddByCodeSheet prefill={prefill} onClose={() => setAddOpen(false)} onSent={() => { setAddOpen(false); load() }} />}
    </>
  )
}
