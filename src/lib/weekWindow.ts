import { addDays, iso, mondayOf } from './dates'

/**
 * The Monday (00:00) of the week currently "in effect" for the kid catch-up
 * window. Doesn't roll over at midnight Sun->Mon — it holds through Monday
 * morning until 9am, so a Monday-before-9am visit still treats last week's
 * catch-up window as open (parents typically settle up/pay out Monday
 * morning; 9am gives a small buffer past that without gaming payouts).
 */
function effectiveCurrentMonday(now: Date): string {
  const trueMonday = mondayOf(iso(now))
  if (iso(now) === trueMonday && now.getHours() < 9) return addDays(trueMonday, -7)
  return trueMonday
}

/**
 * Earliest date kids may navigate to and edit from the Today view: the Monday
 * of the week immediately before the current effective week (i.e. kids always
 * have today plus the one prior week). Anything older is parent-only, via
 * Parent > Weeks > tap a day behind the PIN. Resets every Monday at 9am.
 */
export function kidEditableFrom(now: Date = new Date()): string {
  return addDays(effectiveCurrentMonday(now), -7)
}
