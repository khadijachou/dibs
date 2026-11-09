// The user's first name, typed during onboarding or in More > Settings.
// Kept only on this device (dibs.name): never sent to the server, never logged.
export const NAME_MAX = 24
const KEY = 'dibs.name'

export function getName() {
  try { return (localStorage.getItem(KEY) || '').trim().slice(0, NAME_MAX) } catch { return '' }
}

export function setName(value) {
  const v = String(value || '').trim().slice(0, NAME_MAX)
  try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY) } catch { /* private mode */ }
  return v
}
