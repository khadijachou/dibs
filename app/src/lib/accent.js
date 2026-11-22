// The class that colours a name in its accent (components/LookParts.jsx re-exports this). Coral is included (#E8482A,
// a readable coral in light mode). The caller passes the accent the user actually chose (lib/looks.js accentChoice),
// so null/undefined (never chose) keeps the normal colour; an unknown id adds nothing either.
export const ACCENT_IDS = ['coral', 'mint', 'butter', 'cream', 'citrus', 'gold', 'sunset']
export const accentClass = (id) => (id && ACCENT_IDS.includes(id) ? `lk-acc lk-acc-${id}` : '')
