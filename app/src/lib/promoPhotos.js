// The brands' approved slide photos, as URLs only: import.meta.glob with eager returns the built asset URL for each
// file, and the file downloads only when an <img> asks for it (lazy, on screen). One source for both sizes:
//   smallPhoto(key): 400 px webp (scripts/promo-thumbs.py), a faint texture on the catalogue grid and Popular row.
//   fullPhoto(key):  the full 1200 px slide photo, the Home banner (components/PromoBanner.jsx) and the brand sheet.
// No key = no photo (the card keeps its brand colour); the photos are the approved slides, never a new image.
const SMALL = Object.fromEntries(Object.entries(import.meta.glob('../assets/promo-sm/*.webp', { eager: true, import: 'default' }))
  .map(([path, url]) => [path.split('/').pop().replace(/\.webp$/i, ''), url]))
const FULL = Object.fromEntries(Object.entries(import.meta.glob('../assets/promo/*.{jpg,jpeg,webp}', { eager: true, import: 'default' }))
  .map(([path, url]) => [path.split('/').pop().replace(/\.(jpe?g|webp)$/i, ''), url]))

export const smallPhoto = (key) => SMALL[key] || null
export const fullPhoto = (key) => FULL[key] || null
