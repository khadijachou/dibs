import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addPreview, caretAfterDigits, cleanDigits, digitsBefore, formatAmount } from './addPreview.js'

const NBSP = String.fromCharCode(0xa0)

test('formatAmount groups thousands per language', () => {
  assert.equal(formatAmount('2665', 'en'), '2,665')
  assert.equal(formatAmount('2665', 'fr'), `2${NBSP}665`)
  assert.equal(formatAmount('2665', 'es'), '2665')
  assert.equal(formatAmount('12000', 'en'), '12,000')
  assert.equal(formatAmount('12000', 'fr'), `12${NBSP}000`)
  assert.equal(formatAmount('12000', 'es'), '12.000')
  assert.equal(formatAmount('1234567', 'en'), '1,234,567')
  assert.equal(formatAmount('1234567', 'fr'), `1${NBSP}234${NBSP}567`)
  assert.equal(formatAmount('1234567', 'es'), '1.234.567')
})

test('formatAmount is empty for an empty or non-digit field', () => {
  for (const l of ['en', 'fr', 'es']) {
    assert.equal(formatAmount('', l), '')
    assert.equal(formatAmount('NIM', l), '')
  }
})

// The stored value is language-independent: typing 2665, 12000 or 1234567 always yields that number, even though the
// Spanish display uses "." (which parseNim would misread). cleanDigits is what gets stored, never the formatted string.
test('the stored digits round-trip to the same number in en, fr and es', () => {
  for (const n of [2665, 12000, 1234567]) {
    for (const l of ['en', 'fr', 'es']) {
      const shown = formatAmount(String(n), l)
      const stored = cleanDigits(shown)          // as if the user retyped what they see
      assert.equal(stored, String(n), `${n} ${l} stored`)
      assert.equal(Number(stored), n, `${n} ${l} number`)
    }
  }
})

test('cleanDigits drops separators, letters and leading zeros', () => {
  assert.equal(cleanDigits('2,665'), '2665')
  assert.equal(cleanDigits('2.665'), '2665')
  assert.equal(cleanDigits(`2${NBSP}665`), '2665')
  assert.equal(cleanDigits('007'), '7')
  assert.equal(cleanDigits('0'), '0')
  assert.equal(cleanDigits(''), '')
  assert.equal(cleanDigits('12a000'), '12000')
})

test('digitsBefore counts only digits left of the caret', () => {
  assert.equal(digitsBefore('2,665', 0), 0)
  assert.equal(digitsBefore('2,665', 1), 1)   // right after "2"
  assert.equal(digitsBefore('2,665', 2), 1)   // right after the comma
  assert.equal(digitsBefore('2,665', 5), 4)
})

test('caretAfterDigits lands just after the nth digit, past the separators', () => {
  assert.equal(caretAfterDigits('2,665', 0), 0)
  assert.equal(caretAfterDigits('2,665', 1), 1)   // after "2"
  assert.equal(caretAfterDigits('2,665', 2), 3)   // after "6", skipping the comma
  assert.equal(caretAfterDigits('2,665', 4), 5)
  assert.equal(caretAfterDigits('2,665', 9), 5)   // more than there are: end
})

// Caret stays put when a separator appears: type "2665" then insert "0" after the first "6" -> "26605" shows "26,605".
test('inserting a digit keeps the caret after that digit', () => {
  // user had "2,665" and typed "0" at offset 3 (after "6"): raw becomes "2,6065", caret at 4, two digits to its left...
  const raw = '2,6065'
  const caret = 4
  const left = digitsBefore(raw, caret)           // "2","6","0" -> 3
  assert.equal(left, 3)
  const formatted = formatAmount(cleanDigits(raw), 'en') // "26,065"
  assert.equal(formatted, '26,065')
  assert.equal(caretAfterDigits(formatted, left), 4)     // after "0" -> "26,0|65"
})

test('addPreview: a normal deposit', () => {
  const r = addPreview(8000, 10000, 1000, 50000)
  assert.equal(r.counted, 1000)
  assert.equal(r.total, 9000)
  assert.equal(r.p0, 80)
  assert.equal(r.p1, 90)
  assert.equal(Math.round(r.savedW), 80)
  assert.equal(Math.round(r.addW), 10)
})

test('addPreview: an empty or zero amount adds nothing', () => {
  const r = addPreview(8000, 10000, 0, 50000)
  assert.equal(r.counted, 0)
  assert.equal(r.total, 8000)
  assert.equal(r.p0, 80)
  assert.equal(r.p1, 80)
  assert.equal(r.addW, 0)
})

test('addPreview: over the target is capped at 100 %', () => {
  const r = addPreview(8000, 10000, 5000, 50000)
  assert.equal(r.counted, 5000)
  assert.equal(r.total, 13000)   // the NIM number is not capped
  assert.equal(r.p0, 80)
  assert.equal(r.p1, 100)        // 130 % -> 100
  assert.equal(Math.round(r.savedW), 80)
  assert.equal(Math.round(r.addW), 20) // bar never passes 100 %
})

test('addPreview: over the wallet counts only the wallet balance', () => {
  const r = addPreview(1000, 10000, 5000, 2000)
  assert.equal(r.counted, 2000)  // capped at the wallet
  assert.equal(r.total, 3000)
  assert.equal(r.p0, 10)
  assert.equal(r.p1, 30)
  assert.equal(Math.round(r.addW), 20)
})

test('addPreview: a null balance caps nothing (still reading the wallet)', () => {
  const r = addPreview(1000, 10000, 5000, null)
  assert.equal(r.counted, 5000)
  assert.equal(r.total, 6000)
  assert.equal(r.p1, 60)
})
