// Pure helpers for the "Dibs avatar" shown for other people who do not share their Nimiq avatar:
// the first letter or digit of their name, uppercase, on a coral-to-butter gradient (the gradient is CSS).
// A friend's Nimiq identicon is a fingerprint of a wallet address; showing it to others is a privacy decision
// for a later release, so other people never get an identicon, only this letter avatar or the avatar they shared.

// The initial for a name: the first character that is a letter or a digit, uppercased; "?" when there is none.
export function letterFor(name) {
  for (const ch of String(name || '')) {
    if (/\p{L}|\p{N}/u.test(ch)) return ch.toUpperCase()
  }
  return '?'
}

// Whether a string is a data URL we are willing to draw as an <img> (image data only, never a link or markup).
export const isImageDataUrl = (s) => typeof s === 'string' && (s.startsWith('data:image/svg+xml;base64,') || s.startsWith('data:image/png;base64,'))
