import { ListFooter } from "@miragon/mcp-toolkit-ui"
import type { PagedViewData } from "./use-paged-view-data.js"

/**
 * The paged-list tail every list used to hand-copy: the inline retryable
 * load-more error plus the honest {@link ListFooter}. Takes the
 * {@link PagedViewData} result directly — page-0 failures belong to the
 * caller's loading guard; only load-more failures land here, with the loaded
 * rows staying visible above.
 */
export function PagedListFooter<TItem, TData>({
  paged,
  noun,
  loadMoreErrorText = (message) => `Failed to load more: ${message}`,
  retryLabel = "Try again",
}: {
  paged: PagedViewData<TItem, TData>
  /** Localized plural noun for "Showing X of Y {noun}". */
  noun?: string
  /** Localized error line for a failed load-more; receives the error message. */
  loadMoreErrorText?: (message: string) => string
  retryLabel?: string
}) {
  return (
    <>
      {paged.error && (
        <div role="alert" className="text-critical flex items-center gap-2 text-xs">
          <span>{loadMoreErrorText(paged.error.message)}</span>
          <button
            type="button"
            onClick={paged.loadMore}
            className="border-border bg-card hover:bg-muted focus-visible:ring-ring rounded-md border px-2 py-1 font-medium outline-none focus-visible:ring-2"
          >
            {retryLabel}
          </button>
        </div>
      )}
      <ListFooter
        shown={paged.items.length}
        total={paged.total}
        hasMore={paged.hasMore}
        loadingMore={paged.loadingMore}
        onLoadMore={paged.loadMore}
        noun={noun}
      />
    </>
  )
}
