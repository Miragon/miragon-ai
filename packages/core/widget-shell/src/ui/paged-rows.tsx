import type { ReactNode } from "react"
import { cn } from "./cn.js"
import { TONE_DOT } from "./tone-utils.js"
import type { PagedViewData } from "./use-paged-view-data.js"

/**
 * The rows of a paged list — its table (or row cards) and empty state —
 * marked while they are the PREVIOUS result (`paged.stale`: a new search or
 * filter is in flight or has failed) and `aria-busy` while a page 0 is in
 * flight. The mark is a bar along the left edge in the tone of the state
 * (info while the new page loads, warning once it failed), not a dimming:
 * faded rows push muted text under 4.5:1. Pairs with
 * {@link PagedListFooter}'s status line, which says in words what the bar
 * marks, so old rows under a new search never read as its answer.
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
  const tone = paged.refreshing ? "info" : "warning"
  return (
    <div
      aria-busy={paged.refreshing}
      data-stale={paged.stale || undefined}
      className={cn("relative", className)}
    >
      {paged.stale && (
        <span
          aria-hidden="true"
          data-tone={tone}
          className={cn(
            "pointer-events-none absolute inset-y-0 -left-2 z-10 w-0.5 rounded-full",
            TONE_DOT[tone],
          )}
        />
      )}
      {children}
    </div>
  )
}
