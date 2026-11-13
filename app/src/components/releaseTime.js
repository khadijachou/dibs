// "Ready at {time}": the release time of day in the phone's local time, one format per language (display only).
// Plain JS so node --test can load it (lib/releaseTime.test.js); ReleaseClock.jsx is the only caller.
//   en: 12-hour with a leading zero and AM/PM, "01:11 AM"   fr (Quebec): "01 h 11"   es: 24-hour, "01:11"
const pad = (n) => String(n).padStart(2, '0')

export function clockTime(ms, lang = 'en') {
  const d = new Date(ms)
  const h = d.getHours()
  const m = pad(d.getMinutes())
  if (lang === 'fr') return `${pad(h)} h ${m}`
  if (lang === 'es') return `${pad(h)}:${m}`
  return `${pad(h % 12 || 12)}:${m} ${h < 12 ? 'AM' : 'PM'}`
}
