import type { FitSlot } from "./inline-fit-solve.js"

/**
 * The DOM half of the measured inline fit (`inline-fit.tsx`): where a list's
 * rows are, how they are measured, and the bookkeeping of the view's lists.
 */

/** What the fit measures on the rendered view; injected in tests (happy-dom has no layout). */
export interface FitMeasure {
  /** The content height of the view's document box (px). */
  content: (box: HTMLElement) => number
  /** The bottom edge of each row of a list's rows element, top to bottom. */
  rows: (rowsElement: HTMLElement) => number[]
}

export const ROWS_ATTRIBUTE = "data-inline-fit-rows"
/**
 * On a row that belongs to the row before it (an incident's error line under
 * its incident): the fit counts ITEMS, as the cap does, so this row's bottom
 * is its item's bottom, never an item of its own.
 */
export const CONTINUES_ATTRIBUTE = "data-inline-fit-continues"

/** Spread onto such a row: `<tr {...FIT_CONTINUES_ROW}>`. */
export const FIT_CONTINUES_ROW = { [CONTINUES_ATTRIBUTE]: "" } as const
/** A paged list's wrapper: its rows when no table inside names its body. */
export const FALLBACK_ATTRIBUTE = "data-inline-fit-fallback"
export const LIST_SELECTOR = `[${ROWS_ATTRIBUTE}], [${FALLBACK_ATTRIBUTE}]`

export const DOM_MEASURE: FitMeasure = {
  content(box) {
    // Inline without a budget the box is `display: contents` (no box of its
    // own): the content's extent is the union of its children's boxes.
    if (getComputedStyle(box).display === "contents") {
      const range = document.createRange()
      range.selectNodeContents(box)
      return range.getBoundingClientRect().height
    }
    return box.scrollHeight
  },
  rows(rowsElement) {
    const bottoms: number[] = []
    for (const child of Array.from(rowsElement.children)) {
      // The stale bar of `PagedRows` and anything else laid over the rows.
      if (getComputedStyle(child).position === "absolute") continue
      const rect = child.getBoundingClientRect()
      if (rect.height === 0) continue
      if (child.hasAttribute(CONTINUES_ATTRIBUTE) && bottoms.length > 0) {
        bottoms[bottoms.length - 1] = rect.bottom
      } else bottoms.push(rect.bottom)
    }
    return bottoms
  },
}

interface SlotRecord {
  rows: HTMLElement | null
  /** The paged list's own wrapper: the rows when no table inside names its body. */
  fallback: HTMLElement | null
  /** Fitted once while its rows were visible. */
  placed: boolean
  /** The user revealed rows in place: the fit keeps them until the search or filter changes. */
  frozen: boolean
}

/**
 * The lists of a view and how their rows are found. Plain mutable bookkeeping
 * outside React's state: it changes in ref callbacks and effects, and the fit
 * reads it while measuring.
 */
export class SlotRegistry {
  private readonly records = new Map<string, SlotRecord>()

  /** A row element can arrive before its list registers (refs attach before effects). */
  private recordOf(id: string): SlotRecord {
    let record = this.records.get(id)
    if (!record) {
      record = { rows: null, fallback: null, placed: false, frozen: false }
      this.records.set(id, record)
    }
    return record
  }

  register(id: string): () => void {
    this.recordOf(id)
    return () => {
      this.records.delete(id)
    }
  }

  setRows(id: string, element: HTMLElement | null, kind: "rows" | "fallback"): void {
    element?.setAttribute(kind === "rows" ? ROWS_ATTRIBUTE : FALLBACK_ATTRIBUTE, "")
    this.recordOf(id)[kind] = element
  }

  setFrozen(id: string, frozen: boolean): void {
    this.recordOf(id).frozen = frozen
  }

  /** A new epoch: nothing revealed, nothing placed (a list hidden now fits when it shows). */
  restart(): void {
    for (const record of this.records.values()) {
      record.frozen = false
      record.placed = false
    }
  }

  /** A new search or filter: the list's rows are placed anew once they show. */
  unplace(id: string): void {
    this.recordOf(id).placed = false
  }

  /**
   * The lists showing rows now, in document order; marks them placed. `fresh`
   * says whether one of them was placed for the first time (a list a drill
   * or a tab just showed).
   */
  measure(box: HTMLElement, measure: FitMeasure): { slots: FitSlot[]; fresh: boolean } {
    const ordered = Array.from(box.querySelectorAll<HTMLElement>(LIST_SELECTOR))
    const slots: FitSlot[] = []
    let fresh = false
    for (const [id, record] of this.records) {
      const rows = record.rows ?? record.fallback
      if (!rows) continue
      const bottoms = measure.rows(rows)
      if (bottoms.length === 0) continue
      fresh ||= !record.placed
      record.placed = true
      slots.push({ id, order: ordered.indexOf(rows), bottoms, frozen: record.frozen })
    }
    return { slots, fresh }
  }

  /** A list that has not been fitted while visible, and shows rows now (a tab shown). */
  hasUnplacedVisible(measure: FitMeasure): boolean {
    for (const record of this.records.values()) {
      const rows = record.rows ?? record.fallback
      if (!record.placed && rows && measure.rows(rows).length > 0) return true
    }
    return false
  }
}
