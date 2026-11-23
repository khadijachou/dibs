// The 8 weekly bars (components/InsightsParts.jsx, Bars): the .ins-ends row ("8 weeks ago" / "Now") must be a
// sibling that comes AFTER .ins-bars, never a child of it. A full-width child inside the flex row would squeeze
// the flex:1 bars down to zero width (the empty week-by-week chart bug, v1.7.8). Plain node (no JSX import):
// the component is read from the file as text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../components/InsightsParts.jsx', import.meta.url), 'utf8')

test('the .ins-bars row holds only .ins-bar children, with .ins-ends after it', () => {
  const barsOpen = src.indexOf('className={`ins-bars')
  assert.ok(barsOpen >= 0, '.ins-bars container found')
  const mapClose = src.indexOf('})}', barsOpen) // end of weekly.map(...)
  assert.ok(mapClose > barsOpen, 'the weekly.map block is inside .ins-bars')
  const divCloseAfterMap = src.indexOf('</div>', mapClose) // closes the .ins-bars container
  assert.ok(divCloseAfterMap > mapClose)

  const inner = src.slice(barsOpen, divCloseAfterMap)
  assert.ok(inner.includes('className="ins-bar"'), '.ins-bar children are inside .ins-bars')
  assert.ok(!inner.includes('ins-ends'), '.ins-ends is not a child of .ins-bars')

  const endsIdx = src.indexOf('ins-ends', barsOpen)
  assert.ok(endsIdx > divCloseAfterMap, '.ins-ends is rendered after the .ins-bars container closes')
})
