import { createContext, useContext, type ReactNode } from "react"
import type { InlineRows } from "./inline-fit.js"

/**
 * What an INLINE view may show before it offers more (#396). Inside a chat the
 * view is a card in a scrolling transcript: a card taller than the host's
 * height budget turns into one scroll box (wheel caught mid-transcript, the
 * header and actions scrolled away). So inline, a list shows the head of its
 * rows, as many as fit (the measured fit, `inline-fit.tsx`), and says how
 * many there are; "show more" opens the view in fullscreen where the host
 * offers it, where the cap is gone.
 *
 * Provided by {@link ViewHostBridge} from the host context. Outside a host
 * (fixtures, unit renders) there is no budget.
 */
export interface InlineBudget {
  /** The tallest an inline BPMN canvas draws (px); null = the canvas's own maximum. */
  diagramMaxHeight: number | null
  /** Opens the view in fullscreen where the host offers it; null where it does not. */
  expand: (() => void) | null
}

export const NO_INLINE_BUDGET: InlineBudget = { diagramMaxHeight: null, expand: null }

/** The inline BPMN canvas: enough to read a process, low enough to leave room for the rest. */
export const INLINE_DIAGRAM_MAX_HEIGHT = 320

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
 * The rows of a paged list, which fit as ONE list (`usePagedViewData`): a
 * table frame inside it (`ListTable`) neither caps them a second time nor
 * registers a list of its own; it hands its body to these rows instead.
 * `PagedRows` provides it.
 */
const RowsBudgetedContext = createContext<InlineRows | null>(null)

export function RowsBudgeted({ rows, children }: { rows: InlineRows; children: ReactNode }) {
  return <RowsBudgetedContext.Provider value={rows}>{children}</RowsBudgetedContext.Provider>
}

export function useRowsBudgeted(): InlineRows | null {
  return useContext(RowsBudgetedContext)
}
