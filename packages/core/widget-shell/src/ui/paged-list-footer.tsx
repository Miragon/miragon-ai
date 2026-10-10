import { ListFooter, useLocale } from "@miragon/mcp-toolkit-ui"
import { kitLabels } from "./kit-labels.js"
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
  loadMoreErrorText,
  retryLabel,
}: {
  paged: PagedViewData<TItem, TData>
  /** Localized plural noun for "Showing X of Y {noun}". */
  noun?: string
  /** Localized error line for a failed load-more (default: the active locale's). */
  loadMoreErrorText?: (message: string) => string
  retryLabel?: string
}) {
  const defaults = kitLabels(useLocale())
  return (
    <>
      {/* Screen-reader progress announcement: the visual "Showing X of Y"
          lives inside ListFooter without a live region, so a keyboard user
          gets no feedback when Load more appends rows (the button is even
          disabled under their focus while loading). */}
      <span role="status" className="sr-only">
        {paged.items.length} / {paged.total} {noun ?? ""}
      </span>
      {paged.error && (
        <div role="alert" className="text-critical flex items-center gap-2 text-xs">
          <span>{(loadMoreErrorText ?? defaults.loadMoreFailed)(paged.error.message)}</span>
          <button
            type="button"
            onClick={paged.loadMore}
            className="border-border bg-card hover:bg-muted focus-visible:ring-ring rounded-md border px-2 py-1 font-medium outline-none focus-visible:ring-2"
          >
            {retryLabel ?? defaults.retry}
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
