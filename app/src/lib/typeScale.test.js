// v1.1.10 type scale: every text size in the CSS is a --fs-* token (styles.css :root) or one of the exceptions below,
// form fields never go under 16 px (iOS zooms the page on a smaller field), and no .jsx file sets a size inline.
// REPORT=1 node --test src/lib/typeScale.test.js prints every size that is not a token, with its exception.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const SRC = new URL('../', import.meta.url)
const CSS = ['styles.css', 'theme-dark.css', 'theme-light.css']
const read = (f) => readFileSync(new URL(f, SRC), 'utf8')

// Rules as { file, selector, body } (comments removed; @media and @keyframes blocks are walked into).
function rules(file) {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  let start = 0
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') {
      const prelude = src.slice(start, i).trim()
      if (prelude.startsWith('@')) { start = i + 1; continue }
      const end = src.indexOf('}', i)
      out.push({ file, selector: prelude.replace(/\s+/g, ' '), body: src.slice(i + 1, end) })
      i = end
      start = end + 1
    } else if (src[i] === '}') start = i + 1
  }
  return out
}

// The size a declaration sets: { token } for var(--fs-*), { px } for a pixel size, { inherit } for font: inherit.
function sizes(body) {
  const out = []
  for (const m of body.matchAll(/(?:^|;)\s*(font-size|font)\s*:\s*([^;]+)/g)) {
    const v = m[2].trim()
    if (v === 'inherit') { out.push({ prop: m[1], inherit: true }); continue }
    const tok = v.match(/var\(--fs-([a-z]+)\)/)
    if (tok) { out.push({ prop: m[1], token: tok[1] }); continue }
    const px = v.match(/(\d+(?:\.\d+)?)px/)
    if (px) out.push({ prop: m[1], px: Number(px[1]) })
    else out.push({ prop: m[1], other: v })
  }
  return out
}

const TOKENS = Object.fromEntries([...read('styles.css').matchAll(/--fs-([a-z]+):\s*(\d+)px/g)].map((m) => [m[1], Number(m[2])]))

const BUTTON = 'button or pill: keeps its own size'
const FIELD = 'form field: 16 px or more'
const GLYPH = 'decorative glyph (icon letter, chevron, badge digit)'
const LOGO = 'letter inside a logo tile'
const RING = 'ring percentage or ring readout'
const CODE = 'code box (monospace)'
const SPLASH = 'splash wordmark, tagline and floating cards'
const ONBOARD = 'onboarding hero title and its drawings'
const EXCEPTIONS = {
  'body': 'root size 16 px: fields and unsized text inherit it (iOS zooms on a field under 16 px)',
  '.btn': BUTTON, '.btn.small': BUTTON, '.pill': BUTTON, '.pills .pill': BUTTON, '.pill small': BUTTON, '.hero .acts .btn': BUTTON,
  '.hero .acts .btn.cap small': BUTTON, '.nbtn': BUTTON, '.ob-skip': BUTTON, '.link-danger': BUTTON, '.btn-sm': BUTTON,
  '.stats-card .sc-btns .btn': BUTTON, '.wk-btn': BUTTON, '.news-more': BUTTON, '.cb-pill': BUTTON, '.btn.bsee': BUTTON,
  '.bsheet-pair .btn': BUTTON, '.rw-claim': BUTTON, '.bstamp-share': BUTTON, '.btn.quest-btn': BUTTON, '.bs-region-pills .pill': BUTTON,
  '.btn-text-danger': BUTTON, '.pill.bs-vpill b': BUTTON, '.pill.bs-vpill small, .pill.bs-vpill.on small': BUTTON, '.plan-opts .pill.tall small': BUTTON,
  'textarea.invoice': FIELD, '.name-input': FIELD, '.name-edit input': FIELD, '.cat-search input': FIELD,
  '.trust i': GLYPH, '.notice .ic': GLYPH, '.ferr::before': GLYPH, '.toast i': GLYPH, '.more-btn': GLYPH, '.sheet-row .si:not(.blogo)': GLYPH,
  '.tl-ic': GLYPH, '.tl-badge': GLYPH, '.sheet-row > span.chev:not(.si)': GLYPH, '.name-val .chev': GLYPH, '.name-clear': GLYPH,
  '.prof-avatar': GLYPH, '.wk-next .chev': GLYPH, '.lvl-top .chev': GLYPH, '.lvl-how .chev': GLYPH, '.about-card .price-chip > i': GLYPH,
  '.bs-vals .price-chip > i': GLYPH, '.bs-est > i': GLYPH, '.hiw-ring b': GLYPH, '.lvl-hex b': GLYPH, '.bstamp-lvl b': GLYPH, '.stamp': GLYPH,
  '.blogo.letter': LOGO, '.ut-logo .blogo.letter': LOGO, '.plan-head .blogo.letter, .codecard .blogo.letter': LOGO, '.gift-face .gift-logo.letter': LOGO,
  '.gtile .blogo.letter': LOGO, '.gtile.big .blogo.letter': LOGO, '.bs-card .blogo.letter': LOGO,
  '.hero .n': 'the Home card saved amount: 24 px (v1.1.10 fix, heading too weak)',
  '.dq-done-h': 'the Day done stamp title: 22 px (v1.2.0, listed exception, no token sits between heading 18 and title 26)',
  '.ring-wrap .pct': RING,'.hero .ring-wrap .pct': RING, '.ring-wrap.ready .pct .gap': RING, '.ring-wrap.ready .pct small': RING,
  '.code-box': CODE, '.lab .log': CODE, '.acct b': CODE, '.codecard .face.b .code-box': CODE, '.tl-tx': CODE, '.rw-box': CODE,
  '.fc b': SPLASH, '.fc span': SPLASH, '.splash-tag': SPLASH,
  '.ob-title': ONBOARD, '.gc-label': ONBOARD, '.gc-value': ONBOARD, '.gc-name': ONBOARD, '.coin': ONBOARD, '.coin.c2': ONBOARD,
  '.ir-mid b': ONBOARD, '.ir-mid span': ONBOARD, '.ccard .cc-label': ONBOARD, '.ccard b': ONBOARD, '.cc-copy': ONBOARD,
}

const ALL = CSS.flatMap(rules)

test('the seven tokens are defined once in styles.css with their sizes', () => {
  assert.deepEqual(TOKENS, { display: 32, title: 26, heading: 18, strong: 15, body: 14, meta: 13, label: 12 })
  for (const t of Object.keys(TOKENS)) assert.equal([...read('styles.css').matchAll(new RegExp(`--lh-${t}:`, 'g'))].length, 1, `--lh-${t}`)
})

test('every font-size and font shorthand size is a token, inherit, or a listed exception', () => {
  const report = []
  for (const r of ALL) for (const s of sizes(r.body)) {
    if (s.token) { assert.ok(s.token in TOKENS, `${r.file} ${r.selector}: unknown token --fs-${s.token}`); continue }
    if (s.inherit) continue
    assert.ok(s.px != null, `${r.file} ${r.selector}: ${s.prop} with no size I can read (${s.other})`)
    const why = EXCEPTIONS[r.selector]
    assert.ok(why, `${r.file} ${r.selector}: ${s.px}px is not a token and not an exception`)
    report.push(`${r.file}  ${r.selector}  ${s.px}px  ${why}`)
  }
  if (process.env.REPORT) console.log(report.join('\n'))
})

test('no exception is left unused (the list matches the CSS)', () => {
  const used = new Set(ALL.filter((r) => sizes(r.body).some((s) => s.px != null)).map((r) => r.selector))
  for (const sel of Object.keys(EXCEPTIONS)) assert.ok(used.has(sel), `exception ${sel} sets no pixel size`)
})

test('no input, textarea or select is ever under 16 px', () => {
  const field = /(^|[\s,>+~(])(input|textarea|select)\b|\.name-input\b/
  const checked = []
  for (const r of ALL) {
    if (!field.test(r.selector)) continue
    for (const s of sizes(r.body)) {
      if (s.inherit) continue // takes the parent's size: the body's 16 px (checked below)
      const px = s.token ? TOKENS[s.token] : s.px
      assert.ok(px >= 16, `${r.file} ${r.selector}: ${px}px is under 16 px`)
      checked.push(r.selector)
    }
  }
  assert.ok(checked.length >= 6, 'the field rules were found')
  const body = ALL.find((r) => r.selector === 'body')
  assert.equal(sizes(body.body)[0].px, 16, 'fields that inherit get the body size')
})

test('no .jsx file sets a text size inline (style fontSize or font)', () => {
  const walk = (dir) => readdirSync(new URL(dir, SRC), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}${d.name}/`) : [`${dir}${d.name}`]))
  const jsx = walk('').filter((f) => f.endsWith('.jsx'))
  assert.ok(jsx.length > 20)
  for (const f of jsx) {
    const src = read(f)
    assert.ok(!/fontSize|\bfont\s*:/.test(src), `${f} sets a size inline`)
    // The only SVG text size: the "III" drawn inside a badge medal (a decorative glyph).
    const svg = [...src.matchAll(/font-size="(\d+)"/g)]
    if (f !== 'components/Badge.jsx') assert.equal(svg.length, 0, `${f} has an SVG text size`)
  }
})
