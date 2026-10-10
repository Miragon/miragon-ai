import { ListFooter, useLocale } from "@miragon/mcp-toolkit-ui"
import { kitLabels } from "./kit-labels.js"
import type { PagedViewData } from "./use-paged-view-data.js"

const retryButtonCls =
  "border-border bg-card hover:bg-muted focus-visible:ring-ring rounded-md border px-2 py-1 font-medium outline-none focus-visible:ring-2"

/** One inline failure line with its own retry. */
function RetryAlert({
  text,
  retryLabel,
  onRetry,
}: {
  text: string
  retryLabel: string
  onRetry: () => void
}) {
  return (
    <div role="alert" className="text-critical flex items-center gap-2 text-xs">
      <span>{text}</span>
      <button type="button" onClick={onRetry} className={retryButtonCls}>
        {retryLabel}
      </button>
    </div>
  )
}

/**
 * The paged-list tail every list used to hand-copy: the inline retryable
 * failures plus the honest {@link ListFooter}. Takes the
 * {@link PagedViewData} result directly. A page-0 failure with NO rows on
 * screen belongs to the caller's loading guard; with rows on screen (a failed
 * search or refetch keeps the previous result) it lands here as its own line,
 * whose retry re-runs page 0 — never as "Failed to load more", whose retry
 * fetches the next offset and could not clear it. Wrap the rows in
 * {@link PagedRows} so the stale state is visible above the footer too.
 */
export function PagedListFooter<TItem, TData>({
  paged,
  noun,
  loadMoreErrorText,
  refreshErrorText = (message) =>
    `Could not update the list — showing the previous result: ${message}`,
  retryLabel,
  refreshingText = "Updating…",
}: {
  paged: PagedViewData<TItem, TData>
  /** Localized plural noun for "Showing X of Y {noun}". */
  noun?: string
  /** Localized error line for a failed load-more (default: the active locale's). */
  loadMoreErrorText?: (message: string) => string
  /** Localized error line for a failed page 0 over stale rows; receives the error message. */
  refreshErrorText?: (message: string) => string
  retryLabel?: string
  /** Localized status while a new page 0 is in flight over the rows on screen. */
  refreshingText?: string
}) {
  const defaults = kitLabels(useLocale())
  const retryText = retryLabel ?? defaults.retry
  const staleError = paged.firstPage ? paged.error : null
  return (
    <>
      {/* ONE live region, two jobs. While a page 0 is in flight over the rows
          on screen (a search, a filter, a refetch) it is a VISIBLE "Updating…"
          line — the sighted operator's cue that the rows are not the answer
          yet (PagedRows dims them). Otherwise it is screen-reader only: the
          visual "Showing X of Y" lives inside ListFooter without a live
          region, so a keyboard user would get no feedback when Load more
          appends rows (the button is even disabled under their focus). */}
      <div role="status" className={paged.refreshing ? "text-muted-foreground text-xs" : "sr-only"}>
        {paged.refreshing
          ? refreshingText
          : !paged.stale && `${paged.items.length} / ${paged.total} ${noun ?? ""}`}
      </div>
      {staleError && (
        <RetryAlert
          text={refreshErrorText(staleError.message)}
          retryLabel={retryText}
          onRetry={paged.retry}
        />
      )}
      {paged.loadMoreError && (
        <RetryAlert
          text={(loadMoreErrorText ?? defaults.loadMoreFailed)(paged.loadMoreError.message)}
          retryLabel={retryText}
          onRetry={paged.loadMore}
        />
      )}
      {/* "Showing X of Y" counts the current filter's rows: while the previous
          result stands in (stale), its count beside the new search would read
          as the search's answer. */}
      {!paged.stale && (
        <ListFooter
          shown={paged.items.length}
          total={paged.total}
          hasMore={paged.hasMore}
          loadingMore={paged.loadingMore}
          onLoadMore={paged.loadMore}
          noun={noun}
        />
      )}
    </>
  )
}
