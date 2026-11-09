// Display names in the user's language. The shop names cards "Steam gift card"; we show them through the
// cat_item key ("carte-cadeau Steam", "tarjeta de regalo Steam"). Display only: goals keep their stored
// itemName, so goals created before this keep working. Names that are not "… gift card" (top-ups, other
// products) are shown as the shop names them.
const SUFFIX = / gift card$/i

// raw: "Steam gift card" or a stored label "Steam gift card · 20 USD". title: capitalise the first letter
// (start of a title or a line), otherwise keep cat_item's case for use inside a sentence.
export function localName(t, raw, { title = false } = {}) {
  const str = String(raw ?? '')
  const [name, ...rest] = str.split(' · ')
  if (!SUFFIX.test(name.trim())) return str
  let s = t('cat_item', { brand: name.trim().replace(SUFFIX, '') })
  if (title) s = s.charAt(0).toUpperCase() + s.slice(1)
  return [s, ...rest].join(' · ')
}

// A goal ({ itemName }) or a catalogue item ({ name }).
export const itemName = (t, x, opts) => localName(t, x?.itemName ?? x?.name, opts)
// "Carte-cadeau Steam · 20 USD"
export const itemLabel = (t, g, { title = true } = {}) => `${itemName(t, g, { title })} · ${g.itemDetail}`
