// The top-level error boundary (lib/errorScreen.js, wrapped around <App /> via components/ErrorBoundary.jsx): it shows a
// simple card instead of a blank screen, in en/fr/es, and the "Copy details" payload is only the app version and the error
// message (never a wallet address, a code or goal data).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ErrorBoundary, { FallbackCard, ERROR_STRINGS, errorStrings, errorDetails } from './errorScreen.js'

test('the card strings exist in en, fr and es, with no em dash and no "!"', () => {
  for (const l of ['en', 'fr', 'es']) {
    const s = errorStrings(l)
    for (const k of ['title', 'safe', 'reload', 'copy', 'copied']) {
      assert.ok(typeof s[k] === 'string' && s[k].length > 0, `${l} ${k}`)
      assert.ok(!s[k].includes('—'), `${l} ${k} em dash`)
      assert.ok(!s[k].includes('!'), `${l} ${k} exclamation`)
    }
  }
  assert.equal(errorStrings('zz'), ERROR_STRINGS.en) // unknown language falls back to en
})

test('Copy details carries only the app version and the error message, never wallet, code or goal data', () => {
  const d = errorDetails(new Error('Objects are not valid as a React child'))
  assert.match(d, /^Dibs \d+\.\d+/)
  assert.match(d, /Objects are not valid as a React child/)
  assert.ok(!/NQ[0-9A-Z ]{10}/.test(d), 'no wallet address')
  assert.ok(!/code|pin|goal/i.test(d.replace(/React child/i, '')), 'no code/pin/goal words from our data')
})

test('the fallback card renders the title, the safe line and both buttons', () => {
  const html = renderToStaticMarkup(createElement(FallbackCard, { lang: 'en', error: new Error('x'), copied: false, onReload() {}, onCopy() {} }))
  assert.match(html, /Something went wrong on this screen\./)
  assert.match(html, /Your NIM and goals are safe\./)
  assert.match(html, /Reload/)
  assert.match(html, /Copy details/)
})

test('the boundary renders its card when a child throws, and renders children otherwise', () => {
  function Boom() { throw new Error('boom') } // a child that throws during render
  // React calls getDerivedStateFromError(error) and re-renders the boundary; replay that contract here (no DOM needed).
  const next = ErrorBoundary.getDerivedStateFromError(new Error('boom'))
  assert.ok(next.error, 'the error is put into state')
  const crashed = new ErrorBoundary({ children: createElement(Boom) })
  crashed.state = { ...crashed.state, ...next }
  const html = renderToStaticMarkup(crashed.render())
  assert.match(html, /Something went wrong on this screen\./)
  assert.match(html, /Reload/)
  // With no error, the boundary is transparent: it renders its children.
  const ok = new ErrorBoundary({ children: 'hello' })
  ok.state = { error: null, copied: false }
  assert.equal(ok.render(), 'hello')
})
