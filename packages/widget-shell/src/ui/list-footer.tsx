/**
 * Shared footer for any paginated list: an honest "Showing X of Y" total plus an
 * explicit "Load more" control. Deliberately NOT infinite scroll — in an
 * operations cockpit the operator needs the total, a reachable footer, and
 * control over fetching. Pairs with {@link usePagedViewData}.
 */
export function ListFooter({
  shown,
  total,
  hasMore,
  loadingMore = false,
  onLoadMore,
  noun = "rows",
}: {
  shown: number
  total: number
  hasMore: boolean
  loadingMore?: boolean
  onLoadMore: () => void
  /** Plural noun for the count, e.g. "instances", "jobs". */
  noun?: string
}) {
  if (total <= 0) return null
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-3 px-1 py-2 text-xs">
      <span>
        Showing {shown.toLocaleString()} of {total.toLocaleString()} {noun}
      </span>
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="border-border text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-medium outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  )
}
