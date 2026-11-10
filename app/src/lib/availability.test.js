import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardChangePatch, notSold, readyReturnPatch } from './availability.js'

const riot = (id, value, live, sold) => ({ id, detail: `${value} USD`, live, sold, inStock: true, shopUrl: 'https://www.bitrefill.com/riot-access-usa/' })

test('sold:false (the shop list was read, the value is not in it) = a value the shop does not sell', () => {
  const items = [riot('r10', '9.99', true, true), riot('r25', '24.99', false, false), riot('r50', '49.99', true, true)]
  assert.equal(notSold(items[1], items), true)
  assert.equal(notSold(items[0], items), false)
})

test('live:false next to a live value of the same product, without sold:false, is not hidden (10 Nov, Steam 20/50)', () => {
  const steam = (id, live, sold) => ({ id, live, sold, inStock: true, shopUrl: 'https://www.bitrefill.com/steam-usa/' })
  const items = [steam('steam-5', true, true), steam('steam-20', false, null), steam('steam-50', false, undefined)]
  assert.equal(notSold(items[1], items), false)
  assert.equal(notSold(items[2], items), false)
})

test('live:false on every value (shop lookup failed) is not hidden', () => {
  const items = [riot('r10', '9.99', false, null), riot('r50', '49.99', false, null)]
  assert.equal(notSold(items[0], items), false)
})

test('changing the card keeps deposits, status, deadline and id; records the old card', () => {
  const goal = { id: 'g', itemId: 'old', itemName: 'Xbox gift card', itemDetail: '10 USD', usd: 10, targetNim: 40000, status: 'saving',
    deadline: '2027-01-01', deposits: [{ nim: 5000 }], unlockSteps: [] }
  const patch = cardChangePatch(goal, { item: { id: 'new', name: 'Steam gift card', detail: '20 USD', usd: 22.48, faceValue: '20' }, targetNim: 90000, brand: { key: 'steam', name: 'Steam' }, nimUsd: 0.00025 })
  const next = { ...goal, ...patch }
  assert.deepEqual(next.deposits, goal.deposits)
  assert.equal(next.status, 'saving')
  assert.equal(next.deadline, goal.deadline)
  assert.equal(next.id, 'g')
  assert.equal(next.itemId, 'new')
  assert.equal(next.targetNim, 90000)
  assert.equal(next.cardChanges[0].itemId, 'old')
  for (const k of ['deposits', 'status', 'deadline', 'id', 'unlockSteps']) assert.ok(!(k in patch), k)
})

test('a ready goal returned to the wallet is recorded like the end of a withdraw', () => {
  const p = readyReturnPatch({ deposits: [{ nim: 100 }] }, 100)
  assert.equal(p.status, 'withdrawn')
  assert.equal(p.deposits.at(-1).nim, -100)
  assert.equal(p.deposits.at(-1).kind, 'withdraw')
})
