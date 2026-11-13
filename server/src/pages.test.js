// The two HTML pages: /stats (public) and /admin. The admin page must stay exactly as it was before the
// stats page redesign (v1.1.11): its sha256 below was taken from GET /admin before that change.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { adminPage, statsPage } from './pages.js'

const ADMIN_SHA256 = 'ec071913012a51ceefe30df724072b9043980b904685d0b4a2c7fbec2e498850'

test('pages.js gives statsPage and adminPage as non-empty strings', () => {
  for (const p of [statsPage, adminPage]) {
    assert.equal(typeof p, 'string')
    assert.ok(p.length > 1000)
    assert.ok(p.startsWith('<!doctype html>'))
    assert.ok(p.trimEnd().endsWith('</html>'))
  }
})

test('the stats page keeps the honest label and the three sentences of the note', () => {
  assert.ok(statsPage.includes('NIM deposited through Dibs'))
  assert.ok(!/NIM saved/i.test(statsPage))
  for (const s of [
    'Only phones that tapped Share stats are counted, anonymously: never a name, an email or a gift card code.',
    'A deposit counts once it is found on the Nimiq blockchain.',
    'NIM withdrawn and deposited again counts each time.',
  ]) assert.ok(statsPage.includes(s), s)
  assert.ok(statsPage.includes("fetch('/api/stats'"))
  assert.ok(statsPage.includes('setInterval(load, 60000)'))
  assert.ok(statsPage.includes('The numbers could not be loaded. Try again in a moment.'))
  assert.ok(!statsPage.includes('—'), 'no em dash')
})

test('the stats page never writes API data as HTML', () => {
  const script = statsPage.slice(statsPage.indexOf('<script>'))
  assert.ok(!script.includes('innerHTML'))
  assert.ok(!script.includes('insertAdjacentHTML'))
  assert.ok(!script.includes('document.write'))
})

test('the admin page is byte for byte what it was', () => {
  assert.equal(createHash('sha256').update(adminPage, 'utf8').digest('hex'), ADMIN_SHA256)
})

test('v1.1.12: the live line is the dot and "Live" only, and the Follow on X button is gone', () => {
  assert.ok(statsPage.includes('<span class="live-dot" aria-hidden="true"></span><span>Live</span>'))
  for (const s of ['every minute', 'updated', 'liveText', 'x.com/calldibs_app', 'Follow @calldibs_app', '.follow']) assert.ok(!statsPage.includes(s), s)
  assert.ok(statsPage.includes('setInterval(load, 60000)'), 'still refreshed every 60 s')
})
