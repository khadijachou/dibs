// The brands' approved slide photos, as URLs only: import.meta.glob with eager returns the built asset URL for each
// file, and the file downloads only when an <img> asks for it (lazy, on screen).
//   fullPhoto(key): the full 1200 px slide photo, the Home banner (components/PromoBanner.jsx).
// No key = no photo; the photos are the approved slides, never a new image.
const FULL = Object.fromEntries(Object.entries(import.meta.glob('../assets/promo/*.{jpg,jpeg,webp}', { eager: true, import: 'default' }))
  .map(([path, url]) => [path.split('/').pop().replace(/\.(jpe?g|webp)$/i, ''), url]))

export const fullPhoto = (key) => FULL[key] || null
