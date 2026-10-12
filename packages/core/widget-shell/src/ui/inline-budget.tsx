import { createContext, useContext, type ReactNode } from "react"

/**
 * How much an INLINE view may show before it offers more (#396). Inside a
 * chat the view is a card in a scrolling transcript: a card taller than the
 * host's height budget turns into one scroll box (wheel caught mid-transcript,
 * the header and actions scrolled away). So inline, a list shows the head of
 * its rows and says how many there are; "show more" opens the view in
 * fullscreen where the host offers it, where the cap is gone.
 *
 * Provided by {@link ViewHostBridge} from the host context. Outside a host
 * (fixtures, unit renders) there is no budget: every row renders.
 */
export interface InlineBudget {
  /** Rows a list shows inline before it offers more; null = no cap (fullscreen, no host). */
  rows: number | null
  /** The tallest an inline BPMN canvas draws (px); null = the canvas's own maximum. */
  diagramMaxHeight: number | null
  /** Opens the view in fullscreen where the host offers it; null where it does not. */
  expand: (() => void) | null
}

export const NO_INLINE_BUDGET: InlineBudget = { rows: null, diagramMaxHeight: null, expand: null }

/** Rows inline when the host states no height budget. */
export const DEFAULT_INLINE_ROWS = 8
/** The fewest and most rows an inline list shows. */
const MIN_INLINE_ROWS = 3
const MAX_INLINE_ROWS = 10
/** A dense table row (14 px text, its padding and border). */
const ROW_PX = 41
/** What a list view spends around its rows: header, meta line, filter bar, table head, footer. */
const LIST_CHROME_PX = 280
/** The inline BPMN canvas: enough to read a process, low enough to leave room for the rest. */
export const INLINE_DIAGRAM_MAX_HEIGHT = 320

/**
 * The inline row budget for a host height budget (`containerDimensions`
 * `maxHeight`): the rows that fit under a list's chrome, between 3 and 10;
 * {@link DEFAULT_INLINE_ROWS} when the host states none.
 */
export function inlineRowBudget(maxHeight: number | undefined): number {
  if (maxHeight === undefined || !Number.isFinite(maxHeight)) return DEFAULT_INLINE_ROWS
  const fitting = Math.floor((maxHeight - LIST_CHROME_PX) / ROW_PX)
  return Math.min(MAX_INLINE_ROWS, Math.max(MIN_INLINE_ROWS, fitting))
}

const InlineBudgetContext = createContext<InlineBudget>(NO_INLINE_BUDGET)

export function InlineBudgetProvider({
  budget,
  children,
}: {
  budget: InlineBudget
  children: ReactNode
}) {
  return <InlineBudgetContext.Provider value={budget}>{children}</InlineBudgetContext.Provider>
}

/** The inline budget of this view — {@link NO_INLINE_BUDGET} outside a host or in fullscreen. */
export function useInlineBudget(): InlineBudget {
  return useContext(InlineBudgetContext)
}

/**
 * Rows a paged list already budgeted (`usePagedViewData`), so the table frame
 * inside it (`ListTable`) does not cap them a second time. `PagedRows`
 * provides it.
 */
const RowsBudgetedContext = createContext(false)

export function RowsBudgeted({ children }: { children: ReactNode }) {
  return <RowsBudgetedContext.Provider value={true}>{children}</RowsBudgetedContext.Provider>
}

export function useRowsBudgeted(): boolean {
  return useContext(RowsBudgetedContext)
}
