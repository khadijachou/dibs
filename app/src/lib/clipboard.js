// Clipboard API first; the hidden textarea covers webviews where it is missing or refused.
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall back */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}
