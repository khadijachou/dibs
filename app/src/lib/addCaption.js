// The small caption inside the Home goal card's Add button (display only): what the Add amount is.
// plan: planOf(goal); next: the amount the Add button shows (Home GoalHero). Returns an i18n key, or null for no caption.
//   the amount is all that remains -> add_cap_last (wins over the others)
//   on track                       -> add_cap_week
//   behind or late                 -> add_cap_catchup
//   ahead of plan, done            -> null
export function addCaptionKey(plan, next) {
  const kind = plan?.pace?.kind
  if (!kind || kind === 'done') return null
  if (next >= plan.remaining) return 'add_cap_last'
  if (kind === 'onTrack') return 'add_cap_week'
  if (kind === 'behind' || kind === 'late') return 'add_cap_catchup'
  return null
}
