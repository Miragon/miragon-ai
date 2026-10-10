import type { ReactNode } from "react"
import { cn } from "./cn.js"
import type { PagedViewData } from "./use-paged-view-data.js"

/**
 * The rows of a paged list — its table (or row cards) and empty state —
 * dimmed while they are the PREVIOUS result (`paged.stale`: a new search or
 * filter is in flight or has failed) and `aria-busy` while a page 0 is in
 * flight. Pairs with {@link PagedListFooter}'s status line: the dimming is
 * the cue a sighted operator sees wherever the list is scrolled, so old rows
 * under a new search never read as its answer.
 */
export function PagedRows<TItem, TData>({
  paged,
  className,
  children,
}: {
  paged: PagedViewData<TItem, TData>
  /** Merged into the wrapper (e.g. the `flex flex-col gap-2` of a card list). */
  className?: string
  children: ReactNode
}) {
  return (
    <div
      aria-busy={paged.refreshing}
      data-stale={paged.stale || undefined}
      className={cn("transition-opacity", paged.stale && "opacity-60", className)}
    >
      {children}
    </div>
  )
}
