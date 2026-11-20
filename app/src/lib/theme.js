// Appearance (More > Preferences): the stored choice (dibs.theme) is 'dark', 'light' or 'auto'. Missing or anything
// else = 'dark': the default stays Dark for everyone. 'auto' follows the phone's prefers-color-scheme, live (no reload)
// and before the first paint (index.html runs the same rule). Colours only: theme-light.css is scoped to
// [data-theme="light"]. applyTheme only ever sets data-theme to 'dark' or 'light', never 'auto'.
export const THEMES = ['dark', 'light', 'auto']
const KEY = 'dibs.theme'
// The status bar colour hosts may read from <meta name="theme-color">: coral in dark (as before), the light ground in light.
export const THEME_COLOR = { dark: '#E8482A', light: '#fbf6ef' }

// Fired whenever the look in effect changes (a tap, a Preferences choice, or a live Auto change), so the header's
// theme button and the Appearance row re-render without a reload.
export const THEME_EVENT = 'dibs:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
// The phone's setting. No matchMedia (node tests, old hosts): read as dark, so the default stays Dark.
function phonePrefersDark() {
  try { return !!globalThis.matchMedia && globalThis.matchMedia(DARK_QUERY).matches } catch { return true }
}

// The stored choice, exactly as saved: 'dark', 'light' or 'auto' (missing or anything else reads as 'dark').
export function getThemeChoice() {
  try { const v = localStorage.getItem(KEY); return THEMES.includes(v) ? v : 'dark' } catch { return 'dark' }
}

// Pure: the look a choice resolves to. 'auto' gives 'dark' or 'light' from the phone's setting (prefersDark);
// 'light' gives light; everything else (including bad input) gives dark.
export function resolveTheme(choice, prefersDark = false) {
  if (choice === 'auto') return prefersDark ? 'dark' : 'light'
  return choice === 'light' ? 'light' : 'dark'
}

// The look in effect right now ('dark' or 'light'), from the stored choice and the phone's setting.
export function getTheme() {
  return resolveTheme(getThemeChoice(), phonePrefersDark())
}

export function applyTheme(theme, doc = globalThis.document) {
  const th = theme === 'light' ? 'light' : 'dark'
  if (!doc?.documentElement) return th
  doc.documentElement.dataset.theme = th
  doc.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[th])
  try { globalThis.dispatchEvent?.(new Event(THEME_EVENT)) } catch { /* no window/Event: nothing is listening */ }
  return th
}

// Save the choice and apply the look it resolves to. Keeps the live Auto listener in step with the choice.
export function setTheme(choice, doc) {
  const ch = THEMES.includes(choice) ? choice : 'dark'
  try { localStorage.setItem(KEY, ch) } catch { /* private mode: applies for this session only */ }
  const look = applyTheme(resolveTheme(ch, phonePrefersDark()), doc)
  syncAuto(doc)
  return look
}

// Live: while the choice is 'auto', a change of prefers-color-scheme re-applies the look at once (no reload). One
// listener, attached while the choice is 'auto' and removed as soon as it is not.
let mql = null
let onChange = null
function syncAuto(doc) {
  const auto = getThemeChoice() === 'auto'
  try {
    if (auto && !mql && globalThis.matchMedia) {
      mql = globalThis.matchMedia(DARK_QUERY)
      onChange = (e) => { if (getThemeChoice() === 'auto') applyTheme(e.matches ? 'dark' : 'light', doc) }
      mql.addEventListener('change', onChange)
    } else if (!auto && mql) {
      mql.removeEventListener('change', onChange)
      mql = null
      onChange = null
    }
  } catch { /* no matchMedia: no live follow, the pre-paint script still handles the look on launch */ }
}

// Called once on launch (App.jsx): start the Auto listener when the stored choice is 'auto'.
export function startThemeAuto(doc) { syncAuto(doc) }
