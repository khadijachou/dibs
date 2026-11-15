// The "big update" sheet decision (display only, pure). App.jsx shows WhatsNewSheet once per launch when the app has
// moved to a newer release than the one the phone last saw, and that release's NEWS entry carries a `sheet` (lib/news.js).
// The only saved pointer is dibs.bigSeen, the release ("1.2", "1.3"): set when onboarding finishes and every time the
// sheet is closed. The `big` flag in news.js is unrelated (it lights the dot on More); the sheet is driven by `sheet`.
// Everything here is pure and never throws, so a strange stored value or version can never break the launch.

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
export function bigSheetFor({ version, stored, onboarded, news } = {}) {
  try {
    if (!onboarded) return null
    const release = releaseOf(version)
    if (!release) return null
    const seen = seenOf(stored, onboarded)
    if (cmpRelease(release, seen) <= 0) return null
    const list = Array.isArray(news) ? news : []
    const entry = list.find((e) => releaseOf(e?.v) === release && Array.isArray(e?.sheet) && e.sheet.length > 0)
    if (!entry) return null
    const between = list
      .map((e) => releaseOf(e?.v))
      .filter((r) => r && cmpRelease(r, seen) > 0 && cmpRelease(r, release) < 0)
    const since = between.length ? between.slice().sort(cmpRelease)[0] : null
    return { release, entry, since }
  } catch {
    return null
  }
}
