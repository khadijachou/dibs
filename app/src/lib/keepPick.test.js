import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eligible, pickState, toggle, writes } from './keepPick.js'
import { rankGoals } from './goalOrder.js'

const NOW = Date.parse('2026-11-15T12:00:00Z')
// A goal fixture: deposits sum to savedNim, a far deadline so pace never throws.
const goal = (id, status, targetNim, saved, extra = {}) => ({
  id,
  status,
  targetNim,
  deposits: saved ? [{ id: `${id}-d`, nim: saved, at: '2026-11-01T00:00:00Z' }] : [],
  createdAt: '2026-11-01T00:00:00Z',
  deadline: '2027-02-01T00:00:00Z',
  ...extra,
})

const airbnb = () => goal('airbnb', 'saving', 4000, 3200)
const valorant = () => goal('valorant', 'saving', 23985, 19501)
const row = (st, id) => st.rows.find((r) => r.id === id)

test('one goal covering the gap: gives the whole gap, the rest stays', () => {
  const goals = [airbnb(), valorant()]
  const st = pickState({ goals, gap: 9079, picked: ['valorant'], now: NOW })
  const v = row(st, 'valorant')
  assert.equal(v.give, 9079)
  assert.equal(v.after, 10422)
  assert.equal(v.picked, true)
  assert.equal(v.all, false) // it keeps 10,422: it did not give all it holds
  assert.equal(row(st, 'airbnb').give, 0)
  assert.equal(row(st, 'airbnb').picked, false)
  assert.equal(st.total, 9079)
  assert.equal(st.rest, 0)
  assert.equal(st.covered, true)
})

test('percentages before and after', () => {
  const st = pickState({ goals: [valorant()], gap: 9079, picked: ['valorant'], now: NOW })
  const v = row(st, 'valorant')
  assert.equal(v.pct, 81) // 19,501 / 23,985
  assert.equal(v.pctAfter, 43) // 10,422 / 23,985
})

test('a goal holding less, then a second goal: gives all, then the rest', () => {
  const goals = [airbnb(), valorant()]
  // Airbnb alone: gives all it holds, the gap is not covered yet.
  let st = pickState({ goals, gap: 9079, picked: ['airbnb'], now: NOW })
  let a = row(st, 'airbnb')
  assert.equal(a.give, 3200)
  assert.equal(a.after, 0)
  assert.equal(a.all, true) // gives all it holds
  assert.equal(st.rest, 5879)
  assert.equal(st.covered, false)
  // Then Valorant covers the rest.
  st = pickState({ goals, gap: 9079, picked: ['airbnb', 'valorant'], now: NOW })
  a = row(st, 'airbnb')
  const v = row(st, 'valorant')
  assert.equal(a.give, 3200)
  assert.equal(v.give, 5879)
  assert.equal(v.after, 13622)
  assert.equal(st.total, 9079)
  assert.equal(st.rest, 0)
  assert.equal(st.covered, true)
})

test('covered is false until the gap is covered', () => {
  const goals = [airbnb(), valorant()]
  assert.equal(pickState({ goals, gap: 9079, picked: [], now: NOW }).covered, false)
  assert.equal(pickState({ goals, gap: 9079, picked: ['airbnb'], now: NOW }).covered, false)
  assert.equal(pickState({ goals, gap: 9079, picked: ['airbnb', 'valorant'], now: NOW }).covered, true)
})

test('unpick and repick with toggle', () => {
  let picked = []
  picked = toggle(picked, 'valorant')
  assert.deepEqual(picked, ['valorant'])
  picked = toggle(picked, 'airbnb')
  assert.deepEqual(picked, ['valorant', 'airbnb'])
  picked = toggle(picked, 'valorant') // unpick
  assert.deepEqual(picked, ['airbnb'])
  picked = toggle(picked, 'valorant') // repick at the end
  assert.deepEqual(picked, ['airbnb', 'valorant'])
})

test('only saving goals with NIM are listed, in rankGoals order', () => {
  const goals = [
    airbnb(),
    valorant(),
    goal('unlocking', 'unlocking', 5000, 5000),
    goal('ready', 'ready', 5000, 5000),
    goal('redeemed', 'redeemed', 5000, 5000),
    goal('withdrawn', 'withdrawn', 5000, 0),
    goal('empty', 'saving', 5000, 0),
  ]
  const ids = eligible(goals, NOW).map((g) => g.id)
  assert.deepEqual(ids, ['airbnb', 'valorant'].sort((a, b) => wantOrder(goals, a, b)))
  // Exactly the saving goals that hold NIM, and in the same order Savings ranks them.
  const expected = rankGoals(goals, { now: NOW }).filter((g) => g.status === 'saving' && g.deposits.reduce((s, d) => s + d.nim, 0) > 0).map((g) => g.id)
  assert.deepEqual(ids, expected)
  const st = pickState({ goals, gap: 9079, picked: ['valorant'], now: NOW })
  assert.deepEqual(st.rows.map((r) => r.id).sort(), ['airbnb', 'valorant'])
})

// helper: the order rankGoals would give the two saving goals
function wantOrder(goals, a, b) {
  const order = rankGoals(goals, { now: NOW }).map((g) => g.id)
  return order.indexOf(a) - order.indexOf(b)
}

test('the writes sum exactly to the gap', () => {
  const goals = [airbnb(), valorant()]
  const st = pickState({ goals, gap: 9079, picked: ['airbnb', 'valorant'], now: NOW })
  const w = writes(st)
  assert.equal(w.reduce((s, p) => s + p.nim, 0), 9079) // sums exactly to the gap
  const byId = Object.fromEntries(w.map((p) => [p.goalId, p.nim]))
  assert.deepEqual(byId, { airbnb: 3200, valorant: 5879 })
})

test('a picked goal that would give 0 is ignored (gap already covered)', () => {
  const goals = [airbnb(), valorant()]
  const st = pickState({ goals, gap: 9079, picked: ['valorant', 'airbnb'], now: NOW })
  assert.equal(row(st, 'valorant').give, 9079)
  assert.equal(row(st, 'airbnb').give, 0)
  assert.equal(row(st, 'airbnb').picked, false) // ignored: not shown as a contributing pick
  assert.deepEqual(writes(st), [{ goalId: 'valorant', nim: 9079 }])
})

test('one eligible goal: picked from the start, cannot be unpicked', () => {
  const goals = [valorant(), goal('redeemed', 'redeemed', 5000, 5000)]
  // Even with an empty picked list, the only eligible goal is the pick.
  const st = pickState({ goals, gap: 9079, picked: [], now: NOW })
  assert.equal(row(st, 'valorant').picked, true)
  assert.equal(row(st, 'valorant').give, 9079)
  assert.equal(st.covered, true)
})

test('one eligible goal smaller than the gap: keeps what it holds, the rest is still left', () => {
  const goals = [goal('valorant', 'saving', 23985, 5000)]
  const st = pickState({ goals, gap: 9079, picked: [], now: NOW })
  const v = row(st, 'valorant')
  assert.equal(v.picked, true)
  assert.equal(v.give, 5000)
  assert.equal(v.after, 0)
  assert.equal(v.all, true)
  assert.equal(st.total, 5000)
  assert.equal(st.rest, 4079)
  assert.equal(st.covered, false) // the band stays with what is left; the action is still allowed for 5,000
  assert.deepEqual(writes(st), [{ goalId: 'valorant', nim: 5000 }])
})

test('no eligible goal: empty rows', () => {
  const goals = [goal('redeemed', 'redeemed', 5000, 5000), goal('empty', 'saving', 5000, 0)]
  const st = pickState({ goals, gap: 9079, picked: [], now: NOW })
  assert.deepEqual(st.rows, [])
  assert.equal(st.total, 0)
  assert.equal(st.rest, 9079)
  assert.equal(st.covered, false)
  assert.deepEqual(writes(st), [])
})
