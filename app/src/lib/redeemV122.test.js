// v1.2.2 payment-screen redesign (screens/Redeem.jsx, API mode): the new strings exist in all three
// languages, the money buttons keep their exact guards, no "sats"/"invoice" wording on the redesigned
// screen, and nothing tells the user the code arrives by email.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeT } from './i18n.js'

const T = { en: makeT('en'), fr: makeT('fr'), es: makeT('es') }
const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const src = readFileSync(new URL('../screens/Redeem.jsx', import.meta.url), 'utf8')

// The strings added for the two-step payment screen.
const NEW_KEYS = [
  'redeem_title1', 'redeem_continue', 'redeem_step_receipt', 'redeem_step_pay', 'redeem_step_code',
  'redeem_you_pay', 'redeem_row_price', 'redeem_row_saved', 'redeem_row_wallet', 'redeem_row_receipt',
  'redeem_price_moved', 'redeem_source', 'redeem_pay_btn',
]

test('every new v1.2.2 redeem key is in en, fr and es with the same placeholders, no em dash, no "!"', () => {
  for (const k of NEW_KEYS) {
    const en = T.en(k)
    assert.ok(en && en !== k, `en missing ${k}`)
    const p = ph(en)
    for (const l of ['fr', 'es']) {
      const v = T[l](k)
      assert.ok(v && v !== k, `${l} missing ${k}`)
      assert.deepEqual(ph(v), p, `${k} ${l} placeholders`)
    }
    for (const l of ['en', 'fr', 'es']) {
      const v = T[l](k)
      assert.ok(!v.includes('—'), `${k} ${l} em dash`)
      assert.ok(!v.replace(/Dibs!/g, '').includes('!'), `${k} ${l} "!"`)
    }
  }
})

test('the pay button has the amount in all three languages', () => {
  for (const l of ['en', 'fr', 'es']) assert.deepEqual(ph(T[l]('redeem_pay_btn')), ['nim'], l)
})

// The money buttons on this screen must keep their exact onClick and disabled guards (frozen behaviour).
test('Redeem.jsx keeps the exact button handlers and disabled guards', () => {
  assert.ok(src.includes('disabled={busy || emailBad} onClick={getInvoice}'), 'Continue: getInvoice with busy || emailBad')
  assert.ok(src.includes('disabled={busy || !parsed || locked || (check && !check.ok)} onClick={pay}'), 'Pay: pay with its full guard')
  assert.ok(src.includes('disabled={busy} onClick={() => { setOrder(null); setLeft(null) }}'), 'Get a new price: its handler with busy')
})

// The redesigned API-mode screen shows a NIM total, never sats, and never the word "invoice"
// (the two Lightning error strings redeem_bad / redeem_mismatch are technical edge cases, kept as is).
test('no "sats" and no "invoice" wording in the redesigned API-mode redeem strings', () => {
  const shown = [
    'redeem_title1', 'redeem_step_receipt', 'redeem_step_pay', 'redeem_step_code', 'redeem_continue',
    'redeem_email', 'redeem_email_why', 'redeem_email_bad', 'redeem_you_pay', 'redeem_row_price',
    'redeem_row_saved', 'redeem_row_wallet', 'redeem_row_receipt', 'redeem_price_moved',
    'redeem_expires', 'redeem_pay_nim', 'redeem_source', 'redeem_pay_btn',
  ]
  for (const k of shown) for (const l of ['en', 'fr', 'es']) {
    const v = T[l](k).toLowerCase()
    assert.ok(!/\bsats?\b/.test(v), `${k} ${l} names sats: "${T[l](k)}"`)
    assert.ok(!/invoice|facture|factura/.test(v), `${k} ${l} names the invoice: "${T[l](k)}"`)
  }
})

// The shop emails a receipt with a link to the order, not the code. No redeem/code-screen string may
// claim the code itself is in the email.
test('no redeem string or the code-screen note says the code is in the email', () => {
  const code = /\b(code|código|pin|nip)\b/i
  const mail = /\b(email|e-mail|emailed|courriel|correo)\b/i
  const keys = [...NEW_KEYS, 'redeem_email_why', 'done_note']
  for (const k of keys) for (const l of ['en', 'fr', 'es']) {
    const v = T[l](k)
    assert.ok(!(code.test(v) && mail.test(v)), `${k} ${l} ties the code to the email: "${v}"`)
  }
})
