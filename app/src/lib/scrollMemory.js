// Back keeps your place. go() stamps the current scroll onto the route it pushes on history; back() restores that
// scroll once the previous screen has painted. A target that came from parentOf (nothing on history) has no stamp, so
// it goes to the top, as before. Pure helpers here so the rule is tested without a DOM; App.jsx does the rAF + scroll.

// The route to push on history, carrying where the page was scrolled when the user left it.
export const withScroll = (route, scrollY) => ({ ...route, scrollY: Math.max(0, Math.round(Number(scrollY)) || 0) })

// Where to scroll the restored route, clamped to the page. No saved scroll (or 0) goes to the top; a saved scroll past
// the page end (content shrank) is clamped to the furthest the page can scroll.
export function restoreY(route, pageHeight, viewport) {
  const y = route && typeof route.scrollY === 'number' ? route.scrollY : 0
  if (!(y > 0)) return 0
  const max = Math.max(0, (Number(pageHeight) || 0) - (Number(viewport) || 0))
  return Math.min(y, max)
}
