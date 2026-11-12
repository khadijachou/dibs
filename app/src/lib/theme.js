// Appearance (More > Preferences): dark (the default for everyone) or light. Stored in localStorage dibs.theme;
// missing or anything else = dark. index.html applies it before the first paint (no dark flash in light); this
// module applies a switch at once, without a reload. Colours only: theme-light.css is scoped to [data-theme="light"].
export const THEMES = ['dark', 'light']
const KEY = 'dibs.theme'
// The status bar colour hosts may read from <meta name="theme-color">: coral in dark (as before), the light ground in light.
export const THEME_COLOR = { dark: '#E8482A', light: '#fbf6ef' }

export function getTheme() {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}

export function applyTheme(theme, doc = globalThis.document) {
  const th = theme === 'light' ? 'light' : 'dark'
  if (!doc?.documentElement) return th
  doc.documentElement.dataset.theme = th
  doc.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[th])
  return th
}

export function setTheme(theme, doc) {
  const th = theme === 'light' ? 'light' : 'dark'
  try { localStorage.setItem(KEY, th) } catch { /* private mode: applies for this session only */ }
  return applyTheme(th, doc)
}
