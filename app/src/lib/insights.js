// "See your saving" (v1.3.0): the numbers behind Insights, the weekly recap and the week-by-week card.
// Pure and display only: it never reads storage, never writes, never touches the chain, and `now` is always passed in
// (no Date.now here) so every window runs the same under node --test with a fixed clock and a chosen TZ.
//
// What counts as a deposit: an entry in goal.deposits with nim > 0 and NO kind. Moves ('move'), withdrawals
// ('withdraw') and kept-in-wallet entries ('kept') are all negative or tagged, so they never count. Goals of every
// status count (saving, unlocking, ready, redeemed, withdrawn): history stays once a card is bought. Deleted goals are
// simply not in the list the caller passes in.
//
// Weeks are calendar weeks, Monday to Sunday, in the phone's local time, in every language. All week and day stepping
// is done with local calendar arithmetic (setDate / setHours), never by adding fixed millisecond spans, so a month
// change or a daylight-saving change never drifts a deposit into the wrong bucket.

const DAY = 86_400_000

// Local midnight of the day holding `ms`.
export function dayStart(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// That week's Monday at 00:00 local. getDay() is 0 (Sun) to 6 (Sat); (day + 6) % 7 is days since Monday.
export function weekStart(ms) {
  const d = new Date(ms)
  const back = (d.getDay() + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - back)
  return d.getTime()
}

// Step a whole number of weeks from any timestamp, by calendar days, then normalise to that Monday (DST-safe).
const weekStep = (ms, weeks) => {
  const d = new Date(ms)
  d.setDate(d.getDate() + weeks * 7)
  return weekStart(d.getTime())
}
const prevWeek = (ms) => weekStep(ms, -1)

// First of the calendar month holding `ms`, at 00:00 local.
function monthStart(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  return d.getTime()
}

// A stable per-week key: the Monday as a local YYYY-MM-DD (used for dibs.recapSeen). Not UTC, so it matches the local
// week the user is living in.
export function weekKey(ms) {
  const d = new Date(weekStart(ms))
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Every counted deposit across the goals, as { at, nim } (at = ms of the deposit). Oldest-first order is not needed
// here; callers bucket by time.
function countedDeposits(goals) {
  const out = []
  for (const g of goals || []) {
    for (const d of g?.deposits || []) {
      if (d.kind || !(d.nim > 0)) continue
      const at = Date.parse(d.at)
      if (Number.isFinite(at)) out.push({ at, nim: d.nim })
    }
  }
  return out
}

// The 8 Mondays ending at the week holding `now` (oldest first; last is the current week).
function eightStarts(now) {
  const cur = weekStart(now)
  const starts = []
  for (let i = 7; i >= 0; i--) starts.push(weekStep(cur, -i))
  return starts
}

// 56 per-day sums (oldest first) and the 8 weekly sums over the window whose first day is starts[0].
function windowSums(deposits, starts) {
  const days = new Array(56).fill(0)
  const base = starts[0]
  for (const dep of deposits) {
    // Round the day offset: a single DST change makes a day 23 or 25 hours, which Math.round absorbs (max drift 1 h).
    const di = Math.round((dayStart(dep.at) - base) / DAY)
    if (di >= 0 && di < 56) days[di] += dep.nim
  }
  const weekly = new Array(8).fill(0)
  for (let i = 0; i < 56; i++) weekly[Math.floor(i / 7)] += days[i]
  return { days, weekly }
}

// All counted deposits bucketed by their week's Monday (ms -> nim), across all history.
function weekBuckets(deposits) {
  const by = new Map()
  for (const dep of deposits) {
    const w = weekStart(dep.at)
    by.set(w, (by.get(w) || 0) + dep.nim)
  }
  return by
}

// The main numbers for the Insights page, the Savings row and the recap footer.
export function insights(goals, now) {
  const deposits = countedDeposits(goals)
  const starts = eightStarts(now)
  const { days, weekly } = windowSums(deposits, starts)
  const total8 = weekly.reduce((s, n) => s + n, 0)
  const weeksSaved = weekly.filter((n) => n > 0).length

  const mStart = monthStart(now)
  let thisMonth = 0
  let depositsThisMonth = 0
  for (const dep of deposits) if (dep.at >= mStart) { thisMonth += dep.nim; depositsThisMonth++ }

  const goalsCount = (goals || []).filter((g) => g.status !== 'redeemed' && g.status !== 'withdrawn').length

  // Best week and the runs read all history, not just the 8-week window.
  const by = weekBuckets(deposits)
  let bestWeek = null
  for (const [start, nim] of by) if (!bestWeek || nim > bestWeek.nim) bestWeek = { nim, start }

  const has = (w) => (by.get(w) || 0) > 0
  // Longest run: most consecutive calendar weeks with a deposit, anywhere in history.
  let longestRun = 0
  const seen = new Set()
  for (const w of by.keys()) {
    if (has(prevWeek(w)) || seen.has(w)) continue // only start a run at its first week
    let run = 0
    let cur = w
    while (has(cur)) { run++; seen.add(cur); cur = weekStep(cur, 1) }
    if (run > longestRun) longestRun = run
  }
  // Current run: consecutive weeks up to last week; this week counts once it has a deposit.
  const cur = weekStart(now)
  let currentRun = 0
  let w = has(cur) ? cur : prevWeek(cur)
  while (has(w)) { currentRun++; w = prevWeek(w) }

  return {
    weekly,
    weekStarts: starts,
    days,
    total8,
    weeksSaved,
    thisMonth,
    depositsThisMonth,
    goalsCount,
    bestWeek,
    longestRun,
    currentRun,
    hasAny: deposits.length > 0,
  }
}

// The same 8 weekly numbers (oldest first) for a single goal, and their sum.
export function goalWeekly(goal, now) {
  const deposits = countedDeposits([goal])
  const starts = eightStarts(now)
  const { weekly } = windowSums(deposits, starts)
  return { weekly, total8: weekly.reduce((s, n) => s + n, 0) }
}

// The week BEFORE the current one, for the Home recap. Null when that week had no counted deposit.
export function recap(goals, now) {
  const deposits = countedDeposits(goals)
  const start = prevWeek(weekStart(now))
  const perDay = new Array(7).fill(false)
  let nim = 0
  for (const dep of deposits) {
    const di = Math.round((dayStart(dep.at) - start) / DAY)
    if (di >= 0 && di < 7) { nim += dep.nim; perDay[di] = true }
  }
  if (nim <= 0) return null
  const daysWithDeposit = perDay.filter(Boolean).length
  const weeksSaved = insights(goals, now).weeksSaved // "{n} of the last 8 weeks saved"
  return { start, nim, daysWithDeposit, perDay, weeksSaved }
}

// A compact NIM amount: above 1,000 one decimal with a k (or M above a million); under 1,000 the plain number.
// en "11.4k"; fr and es "11,4 k" (comma, no-break space before the suffix). The plain form carries thousands grouping
// in the user's language (it only ever applies to the M/k path's integer fallback, kept for symmetry).
export function compactNim(n, lang = 'en') {
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(Number(n) || 0)
  const comma = lang === 'fr' || lang === 'es'
  const dec = (x) => { const s = x.toFixed(1); return comma ? s.replace('.', ',') : s }
  const gap = comma ? ' ' : '' // no-break space before k / M in fr and es
  if (v >= 1_000_000) return `${sign}${dec(v / 1_000_000)}${gap}M`
  if (v >= 1_000) return `${sign}${dec(v / 1_000)}${gap}k`
  return sign + String(Math.floor(v))
}

// ---------------------------------------------------------------------------
// Part 2: the two badge rules (pure), the longest-run progress, and the month-share data.

// The longest run of consecutive calendar weeks with a counted deposit, over all history (a current, in-progress week
// counts as soon as it has a deposit).
export function longestRunWeeks(goals) {
  const by = weekBuckets(countedDeposits(goals))
  const has = (w) => (by.get(w) || 0) > 0
  let longest = 0
  const seen = new Set()
  for (const w of by.keys()) {
    if (has(prevWeek(w)) || seen.has(w)) continue // only start a run at its first week
    let run = 0
    let cur = w
    while (has(cur)) { run++; seen.add(cur); cur = weekStep(cur, 1) }
    if (run > longest) longest = run
  }
  return longest
}

// "8 weeks running": at least 8 consecutive calendar weeks with a deposit (the current run or any past run).
export const weeks8Earned = (goals, now) => longestRunWeeks(goals, now) >= 8
// Progress for the Personal bests card: the longest run so far (shown out of 8).
export const weeks8Progress = (goals, now) => longestRunWeeks(goals, now)

// "Best week ever": a FINISHED week whose total beats every earlier week, once there are at least 3 earlier weeks with a
// deposit (so the first weeks do not give it away). The current, unfinished week never earns it; an equal week does not
// beat.
export function bestWeekEarned(goals, now) {
  const by = weekBuckets(countedDeposits(goals))
  const cur = weekStart(now)
  const weeks = [...by.keys()].filter((w) => w < cur).sort((a, b) => a - b) // finished deposit-weeks, oldest first
  for (let i = 3; i < weeks.length; i++) {
    const maxEarlier = Math.max(...weeks.slice(0, i).map((x) => by.get(x)))
    if (by.get(weeks[i]) > maxEarlier) return true
  }
  return false
}

// A per-calendar-month key, local time (used for the once-a-month share XP, like weekKey for weeks).
export function monthKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// The data the month-share image is drawn from. Totals and ids only: no address, no balance, no fiat value, no code,
// no user-typed goal name. goalIds = the goals that received a counted deposit this calendar month (the screen maps
// them to brand logos); the image never carries a name.
export function monthShareStats(goals, now) {
  const mStart = monthStart(now)
  let nim = 0
  const ids = new Set()
  for (const g of goals || []) {
    for (const d of g?.deposits || []) {
      if (d.kind || !(d.nim > 0)) continue
      const at = Date.parse(d.at)
      if (Number.isFinite(at) && at >= mStart) { nim += d.nim; ids.add(g.id) }
    }
  }
  const { weekly } = windowSums(countedDeposits(goals), eightStarts(now))
  const base = insights(goals, now)
  const net = (g) => (g.deposits || []).reduce((s, d) => s + (d.nim || 0), 0)
  const at100 = (goals || []).filter((g) => g.status !== 'withdrawn' && g.targetNim > 0 && net(g) >= g.targetNim).length
  return { nim, weekly, weeksSaved: base.weeksSaved, goalsCount: base.goalsCount, at100, goalIds: [...ids], monthKey: monthKey(now) }
}
