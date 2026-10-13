/**
 * How many rows each inline list of a view keeps so the view fits the host's
 * height budget (#396): the pure half of the measured inline fit
 * (`inline-fit.tsx` measures, this decides). Inputs are what the rendered
 * view measures, never assumed sizes: the content's height and, per list,
 * the bottom edge of every row it shows. Dropping rows k…n−1 of a list saves
 * the distance between the bottom of its last shown row and the bottom of
 * row k−1.
 *
 * The order rows go in:
 *  1. one row at a time from the list showing the most rows (a tie: the later
 *     list first), down to {@link FitLimits.softMin} each;
 *  2. then the lists after the first one, last first, down to
 *     {@link FitLimits.hardMin}; then the first list.
 * When the view does not fit even at `hardMin` everywhere, cutting below
 * `softMin` buys nothing: the result is the state after step 1 and
 * `fits: false` (the view then scrolls inside the budget, its safety net).
 *
 * A cap never grows here (growth is a new epoch: another budget, width or
 * display mode), never drops below `hardMin`, and a list frozen by the user
 * ("Show more" in place) is never cut.
 */

export interface FitSlot {
  id: string
  /** Position in the document: lower is earlier. */
  order: number
  /** The bottom edge (px, any common origin) of each row the list shows, top to bottom. */
  bottoms: readonly number[]
  /** The user revealed rows in place: keep them. */
  frozen: boolean
}

export interface FitLimits {
  /** Rows a list keeps before any list goes below it. */
  softMin: number
  /** The fewest rows a list ever shows inline. */
  hardMin: number
}

export const FIT_LIMITS: FitLimits = { softMin: 3, hardMin: 1 }

export interface FitResult {
  /** The new row count of every list that loses rows; lists not named keep theirs. */
  cuts: Record<string, number>
  /** The content fits the budget after the cuts (as far as the cuts can tell). */
  fits: boolean
}

interface Working {
  slot: FitSlot
  shown: number
  keep: number
}

/** What dropping a list's rows below `keep` saves. */
function savedBy({ slot, shown, keep }: Working): number {
  if (keep >= shown) return 0
  return slot.bottoms[shown - 1] - slot.bottoms[keep - 1]
}

const totalSaved = (lists: readonly Working[]) =>
  lists.reduce((sum, list) => sum + savedBy(list), 0)

/** Step 1: the list with the most rows gives one, down to `softMin`. */
function trimToSoftMin(lists: Working[], over: number, softMin: number): void {
  while (totalSaved(lists) < over) {
    let pick: Working | undefined
    for (const list of lists) {
      if (list.keep <= Math.min(softMin, list.shown)) continue
      if (
        !pick ||
        list.keep > pick.keep ||
        (list.keep === pick.keep && list.slot.order > pick.slot.order)
      ) {
        pick = list
      }
    }
    if (!pick) return
    pick.keep -= 1
  }
}

/** Step 2: the later lists, last first, then the first one, down to `hardMin`. */
function trimToHardMin(lists: Working[], over: number, hardMin: number): void {
  const byOrder = [...lists].sort((a, b) => a.slot.order - b.slot.order)
  const sequence = [...byOrder.slice(1).reverse(), ...byOrder.slice(0, 1)]
  for (const list of sequence) {
    while (totalSaved(lists) < over && list.keep > hardMin) list.keep -= 1
    if (totalSaved(lists) >= over) return
  }
}

export function solveInlineFit(
  input: { budget: number; content: number; slots: readonly FitSlot[] },
  limits: FitLimits = FIT_LIMITS,
): FitResult {
  const over = Math.ceil(input.content) - input.budget
  if (over <= 0) return { cuts: {}, fits: true }
  const lists: Working[] = input.slots
    .filter((slot) => !slot.frozen && slot.bottoms.length > 0)
    .map((slot) => ({ slot, shown: slot.bottoms.length, keep: slot.bottoms.length }))

  trimToSoftMin(lists, over, limits.softMin)
  const soft = lists.map((list) => list.keep)
  let fits = totalSaved(lists) >= over
  if (!fits) {
    trimToHardMin(lists, over, Math.max(1, limits.hardMin))
    fits = totalSaved(lists) >= over
    // Below softMin only where it makes the view fit.
    if (!fits) lists.forEach((list, i) => (list.keep = soft[i]))
  }

  const cuts: Record<string, number> = {}
  for (const list of lists) if (list.keep < list.shown) cuts[list.slot.id] = list.keep
  return { cuts, fits }
}
