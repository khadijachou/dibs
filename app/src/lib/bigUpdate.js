// The "big update" sheet decision (display only, pure). App.jsx shows WhatsNewSheet once per launch when the app has moved
// past the version the phone last saw to a NEWS entry that carries a `sheet` (lib/news.js). The only saved pointer is
// dibs.bigSeen, the FULL version of the last sheet seen ("1.7.1"): set when onboarding finishes (to the current version, so
// a new user never sees one) and every time the sheet is closed (to the shown entry's version). An old stored value that is
// only a release ("1.7") counts as its ".0" ("1.7.0"), so a phone that saw the 1.7.0 sheet still gets 1.7.1. The `big` flag
// in news.js is unrelated (it lights the dot on More); the sheet is driven by `sheet`. Everything here is pure and never
// throws, so a strange stored value or version can never break the launch.

// The first two numbers of a version, as a release string. "1.3.0" -> "1.3", "1.2.7" -> "1.2", "1.3" -> "1.3",
// "2.0.1" -> "2.0". Anything that is not two numbers (or more) -> null.
export function releaseOf(version) {
  if (typeof version !== 'string') return null
  const parts = version.split('.')
  if (parts.length < 2) return null
  const [a, b] = parts
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return null
  return `${Number(a)}.${Number(b)}`
}

// Numeric compare of two release strings: >0 when a is newer. So "1.10" is newer than "1.9" and "2.0" newer than "1.9".
export function cmpRelease(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  const am = pa[0] || 0; const bm = pb[0] || 0
  if (am !== bm) return am - bm
  return (pa[1] || 0) - (pb[1] || 0)
}

// A full version parsed to [major, minor, patch], a missing patch counting as 0 (so "1.7" == "1.7.0"). null on bad input.
export function verParts(version) {
  if (typeof version !== 'string') return null
  const parts = version.split('.')
  if (parts.length < 2) return null
  const [a, b, c = '0'] = parts
  if (![a, b, c].every((x) => /^\d+$/.test(x))) return null
  return [Number(a), Number(b), Number(c)]
}

// Numeric compare of two full versions: >0 when a is newer. Bad input counts as [0,0,0]. "1.7" and "1.7.0" compare equal.
export function cmpVer(a, b) {
  const pa = verParts(a) || [0, 0, 0]
  const pb = verParts(b) || [0, 0, 0]
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

// The full version the phone last saw: a valid stored version wins (a release like "1.7" counts as "1.7.0" via cmpVer);
// missing or invalid on an onboarded phone counts as "1.2.0" (the release this mechanism shipped in); not onboarded: null.
export function seenVer(stored, onboarded) {
  if (!onboarded) return null
  return verParts(stored) ? stored : '1.2.0'
}

// The release the phone last saw: the stored value when it is a valid release; when it is missing or invalid on a phone
// that is onboarded, "1.2" (the release this mechanism ships in, so an old phone is treated as having seen 1.2); when the
// phone is not onboarded, null (nothing to show yet).
export function seenOf(stored, onboarded) {
  if (!onboarded) return null
  return releaseOf(stored) || '1.2'
}

// The sheet to show at launch, or null. { release, entry, since }:
//   release = releaseOf(version). Not onboarded -> null. Not newer than seenOf(stored, onboarded) -> null.
//   entry   = the NEWS entry whose v names this release ("1.3" or "1.3.0") AND carries a non-empty `sheet` array.
//             No such entry -> null (and App.jsx saves nothing, so it is tried again next launch, once the content ships).
//   since   = when one or more releases sit strictly between the seen release and this one in NEWS, the OLDEST of them
//             as a string; otherwise null. "And more since {since}" on the sheet.
// v1.4.1 one-time catch-up for the 1.4 sheet. During ~1 h after the 1.4 release VITE_FRIENDS_URL was missing, so
// bigSheetFor skipped the sheet for those phones and (in v1.4.0) still saved dibs.bigSeen = '1.4', so it could never
// return. This shows it once, now, when all four hold: the phone last saw '1.4' (stored), Friends is configured,
// Friends was never turned on (friendsState is null), and this catch-up has not run (seen14b not set). Pure; returns
// the same { release, entry, since } shape as bigSheetFor, or null.
export function catchUp14({ stored, seen14b, friendsEnabled, friendsState, onboarded, news } = {}) {
  try {
    if (!onboarded || !friendsEnabled) return null
    if (seen14b) return null
    if (friendsState != null) return null
    if (releaseOf(stored) !== '1.4') return null
    const entry = (Array.isArray(news) ? news : []).find((e) => e?.v === '1.4')
    if (!entry) return null
    return { version: entry.v, release: '1.4', entry, since: null }
  } catch {
    return null
  }
}

// The sheet to show at launch, or null. { version, release, entry, since }:
//   entry   = the NEWEST NEWS entry that carries a non-empty `sheet`, whose version is newer than the one the phone last saw
//             and not newer than the running app. No such entry -> null (App.jsx saves nothing, so it is retried next launch).
//   version = entry.v, the full version to store as dibs.bigSeen when the sheet is closed.
//   release = releaseOf(entry.v), for the sheet's version pill and title.
//   since   = when other sheet-carrying entries sit strictly between the seen version and the shown one, the OLDEST of them
//             as a release string ("And more since {since}"); otherwise null.
export function bigSheetFor({ version, stored, onboarded, news } = {}) {
  try {
    if (!onboarded || !verParts(version)) return null
    const seen = seenVer(stored, onboarded)
    const list = Array.isArray(news) ? news : []
    const candidates = list.filter((e) => Array.isArray(e?.sheet) && e.sheet.length > 0 && verParts(e?.v)
      && cmpVer(e.v, seen) > 0 && cmpVer(e.v, version) <= 0)
    if (!candidates.length) return null
    const entry = candidates.slice().sort((a, b) => cmpVer(b.v, a.v))[0] // the newest one is shown
    const between = candidates.filter((e) => cmpVer(e.v, entry.v) < 0) // other sheet entries between seen and shown
    const since = between.length ? releaseOf(between.slice().sort((a, b) => cmpVer(a.v, b.v))[0].v) : null
    return { version: entry.v, release: releaseOf(entry.v), entry, since }
  } catch {
    return null
  }
}
