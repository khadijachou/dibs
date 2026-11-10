// The badge medal: the Nimiq hexagon in the badge group's colour with a 24 x 24 stroke glyph inside.
// medalSvg() returns plain SVG markup built from static strings only (never user text): the screens render it with
// <Medal />, and the same string feeds the share poster canvas (lib/poster.js draws it as an image).
import { badgeById } from '../lib/badges.js'
import { MARK_RIBBON, MARK_RING } from './ui.jsx'

const HEX = 'M26.6991 10.875L21.0741 1.125C20.6691 0.4275 19.9266 0 19.1241 0H7.87414C7.07164 0 6.32914 0.4275 5.92789 1.125L0.302891 10.875C-0.0983594 11.5725 -0.0983594 12.4275 0.302891 13.125L5.92789 22.875C6.32914 23.5725 7.07164 24 7.87414 24H19.1241C19.9266 24 20.6691 23.5725 21.0704 22.875L26.6954 13.125C27.1004 12.4275 27.1004 11.5725 26.6991 10.875Z'

export const GROUP_COLORS = {
  way: { bg: '#E8482A', fg: '#FFF6EC' },
  set: { bg: '#FFC94D', fg: '#23212B' },
  grow: { bg: '#15896A', fg: '#FFF6EC' },
  special: { bg: '#E9B213', fg: '#23212B' },
}
const LOCKED = { bg: '#2a2733', fg: '#5d5966' }

const GLYPHS = {
  flag: '<path d="M6 21V4h11l-2 4 2 4H6"/>',
  seed: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 15c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
  up: '<path d="M4 17 10 11l4 4 6-7"/><path d="M15 8h5v5"/>',
  half: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  glass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9"/>',
  dmark: `<g transform="translate(6.6 3.2) scale(0.056)" fill="currentColor" stroke="none"><path fill-rule="evenodd" d="${MARK_RING}"/><polygon points="${MARK_RIBBON}"/></g>`,
  fast: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  loop: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
  three: '<circle cx="6" cy="14" r="2.5"/><circle cx="12" cy="8" r="2.5"/><circle cx="18" cy="14" r="2.5"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  pad: '<rect x="3" y="8" width="18" height="10" rx="5"/><path d="M8 11v4M6 13h4M15.5 12h.01M17.5 14h.01"/>',
  plane: '<path d="M10.5 13.5 3 11l1.5-1.5 8 1L17 6c1-1 2.5-1 3 0s0 2-1 3l-4.5 4.5 1 8L14 23l-2.5-7.5L8 19v2l-1.5 1.5-1-3.5-3.5-1L3.5 16.5h2z"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>',
  fork: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 21V3c-2 1.5-3 4-3 7h3"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  leaf1: '<path d="M12 21v-7"/><path d="M12 14c-4 0-6-3-6-7 4 0 6 3 6 7z"/>',
  leaf2: '<path d="M8 21v-6M16 21v-6"/><path d="M8 15c-3 0-4.5-2.5-4.5-5.5C6.5 9.5 8 12 8 15zM16 15c3 0 4.5-2.5 4.5-5.5-3 0-4.5 2.5-4.5 5.5z"/>',
  leaf3: '<path d="M12 21V9M6 21v-5M18 21v-5"/><path d="M12 9l-4 5h8zM12 4l-3.5 5h7zM6 16l-2.5 3h5zM18 16l-2.5 3h5z"/>',
  iii: '<text x="12" y="16.5" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="11" fill="currentColor" stroke="none">III</text>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.3 10.8 15.7 6.2M8.3 13.2l7.4 4.6"/>',
}

const LOCK = '<g transform="translate(19.2 15.5)"><circle r="4.2" fill="#1B1920"/>'
  + '<rect x="-1.9" y="-0.6" width="3.8" height="2.9" rx=".6" fill="#8b8794"/>'
  + '<path d="M-1.1-.6v-1a1.1 1.1 0 0 1 2.2 0v1" fill="none" stroke="#8b8794" stroke-width=".8"/></g>'

// SVG markup for one badge medal. size = width in px; height = size x 24/27.
export function medalSvg(badgeId, earned, size = 58) {
  const b = badgeById(badgeId)
  if (!b) return ''
  const { bg, fg } = earned ? GROUP_COLORS[b.group] : LOCKED
  const w = Math.round(size * 100) / 100
  const h = Math.round(size * (24 / 27) * 100) / 100
  const fid = `md-${b.id}`
  const shadow = earned
    ? `<defs><filter id="${fid}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy=".6" stdDeviation=".6" flood-color="${bg}" flood-opacity=".33"/></filter></defs>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="-1 -1 29 26" overflow="visible" aria-hidden="true">`
    + shadow
    + `<path d="${HEX}" fill="${bg}"${earned ? ` filter="url(#${fid})"` : ''}/>`
    + `<g transform="translate(7.5 6) scale(0.5)" fill="none" stroke="${fg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" color="${fg}">${GLYPHS[b.glyph]}</g>`
    + (earned ? '' : LOCK)
    + '</svg>'
}

// The medal on screen. The markup comes from medalSvg (static strings only), so dangerouslySetInnerHTML is safe here.
export function Medal({ id, earned, size = 58, className = '' }) {
  return <span className={`medal ${className}`} style={{ width: size, height: Math.round(size * 24 / 27) }} dangerouslySetInnerHTML={{ __html: medalSvg(id, earned, size) }} />
}
