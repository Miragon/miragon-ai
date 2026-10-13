import { useCallback, useMemo, useState } from "react"
import { parseToolResult, useCallTool, useLocale } from "@miragon/mcp-toolkit-ui"
import { useViewData, type UseViewDataOptions } from "@miragon/mcp-toolkit-ui/hooks"
import { useInlineBudget } from "./inline-budget.js"
import { useInlineRows, type InlineRows } from "./inline-fit.js"
import { kitLabels } from "./kit-labels.js"

/**
 * The pages appended after page 0, tagged with the reset generation they belong
 * to. Every reset starts a new generation, and a resolved page is applied only
 * while its generation is still current — an A→B→A filter round-trip must not
 * append a stale-offset page (comparing the filter *value* would wrongly accept
 * it). The generation lives in state rather than a ref so the render-phase reset
 * stays replay-safe: a discarded render leaves no trace.
 */
interface PagedState<TItem> {
  gen: number
  items: TItem[]
  /**
   * A resolved page whose total lied short-circuits here: a page shorter than
   * pageSize means the server is out of rows, whatever `total` claims.
   */
  exhausted: boolean
  error: Error | null
}

export interface PagedViewData<TItem, TData = unknown> {
  /**
   * The rows to show: every loaded page — inline under a host, at most as
   * many as fit the view's height budget (the measured fit, #396); `hasMore`
   * then says there are more and `loadMore` shows them (fullscreen where the
   * host offers it, else the next rows in place). The footer's "Showing X of
   * Y" counts what is shown.
   */
  items: TItem[]
  /**
   * The page-0 payload (handed-in or self-fetched) for reading list metadata.
   * While a NEW page 0 is in flight (or has failed), the previous result of
   * the same list stays here — never null mid-search; {@link stale} says so.
   */
  firstPage: TData | null
  /**
   * Server-reported total of {@link firstPage} (drives "X of Y" + hasMore) —
   * while {@link stale}, the PREVIOUS result's, not the current filter's.
   */
  total: number
  /**
   * {@link firstPage} — and with it `items` and `total` — is the PREVIOUS
   * result of this list, not the current args' page 0: a changed search or
   * filter is still in flight, or has failed. Whatever the list says about
   * its rows (a header count, the filters it covers, a model context, an
   * empty-state text) must then describe that previous result — read it from
   * the payload on screen, never from the request that has not answered.
   * (A same-filter refetch is not stale: its last good page is still the
   * current filter's.)
   */
  stale: boolean
  hasMore: boolean
  loadMore: () => void
  /** First page is still loading (self-fetch, nothing to show yet). */
  loading: boolean
  /** A page 0 is in flight while rows are on screen (a changed filter, a refetch). */
  refreshing: boolean
  /** A subsequent page is in flight. */
  loadingMore: boolean
  /**
   * The PAGE-0 failure. Without a `firstPage` it is the load error the
   * caller's guard renders (once the client's retries ran out). With one, the
   * rows on screen are unconfirmed — the previous filter's ({@link stale}), or
   * the last good answer of a failed refetch — and it is set from the fetch's
   * FIRST failed attempt (the toolkit's `failureReason`), like
   * `viewRefreshState`'s `refreshError`: the same for a refetch of this
   * filter's page (a write's invalidation, a Retry) and for a changed search
   * or filter, so the list never presents the rows as current for the length
   * of the backoff. {@link retry} re-runs page 0.
   */
  error: Error | null
  /**
   * Re-runs the page-0 fetch: the retry for {@link error}. A new read at
   * once — also while the client still waits on that fetch's retry backoff
   * (which `error` already reports), never a wait for the running chain (the
   * toolkit's `useViewData` refetch cancels it first).
   */
  retry: () => void
  /** The last load-more failure — `loadMore` retries it; the rows above are current. */
  loadMoreError: Error | null
  /**
   * The list's place in the inline fit: `PagedRows` hands it to the table
   * inside, or a list of its own rows (an `<ol>`) passes `fit.attachRows` to
   * the element whose children are the rows.
   */
  fit: InlineRows
  /**
   * Words for the toolkit's `PagedListFooter` (`labels`): while `loadMore`
   * opens fullscreen, its button says "Show all", not "Load more".
   */
  footerLabels: { loadMore: string } | undefined
}

type PlaceholderOf<TData> = UseViewDataOptions<TData>["placeholderData"]

/**
 * Keep-previous-data for page 0, TanStack's own: a changed search or filter
 * keys a new page 0 whose data is undefined until it lands (a seed is only
 * ever the unfiltered page 0), so without a placeholder the caller's loading
 * guard would unmount the list — and the search box the operator is typing
 * into — for every round-trip. The placeholder is the previous answer of the
 * SAME list only (`scope`, the cache-key prefix): another engine or definition
 * never shows the previous list's rows. `isPlaceholderData` is then `stale`.
 */
function useSameListPlaceholder<TData>(key: ReadonlyArray<unknown>): {
  scope: string
  placeholderData: PlaceholderOf<TData>
} {
  const scope = JSON.stringify(key)
  const depth = key.length
  const placeholderData = useCallback(
    (previous: TData | undefined, previousQuery?: { queryKey: readonly unknown[] }) =>
      previousQuery && JSON.stringify(previousQuery.queryKey.slice(0, depth)) === scope
        ? previous
        : undefined,
    [scope, depth],
  )
  return { scope, placeholderData: placeholderData as PlaceholderOf<TData> }
}

/**
 * The page on screen once a changed search's page 0 FAILED for good. TanStack
 * shows a placeholder only while the query is pending and drops it when the
 * retries ran out, but the failure line over the list says "you're seeing the
 * previous result" (the toolkit's `PagedListFooter`), so those rows must stay:
 * the page last shown for this list (render-phase state, replay-safe) bridges
 * that failure until the list's next answer. In flight it is TanStack's
 * placeholder, never this.
 */
function useShownPage<TData>(data: TData | null, scope: string, failed: boolean): TData | null {
  const [shown, setShown] = useState<{ scope: string; data: TData } | null>(null)
  if (data && (shown?.data !== data || shown.scope !== scope)) setShown({ scope, data })
  if (data) return data
  return failed && shown?.scope === scope ? shown.data : null
}

/**
 * Offset-paginated sibling of the toolkit's `useViewData`: one component, both
 * modes, plus "Load more". Page 0 is the feed query in the toolkit's
 * `initialDataMode: "seed"`, seeded with `initialData` (standalone, handed in)
 * or self-fetched (cockpit), so a write's invalidation refetches a standalone
 * list too; `loadMore()` fetches the next offset and appends. Changing `args`
 * (e.g. a server-side search/filter) resets pagination to page 0 while the
 * previous rows of the same list stay on screen (`stale`). The feed must
 * accept `firstResult`/`maxResults` and return the full filtered `total` so
 * the footer is honest and `hasMore` is correct.
 *
 * Deliberately explicit (button-driven), not infinite scroll — see the
 * toolkit's `ListFooter`.
 */
export function usePagedViewData<TItem, TData>(opts: {
  initialData: TData | null | undefined
  /** Stable cache-key prefix (e.g. ["camunda7:process-instances", engine, key]). */
  key: ReadonlyArray<unknown>
  tool: string
  /** Filter args (without firstResult/maxResults); changing these resets paging. */
  args: Record<string, unknown>
  pageSize: number
  /** Gate the self-fetch until the required scope is present. */
  ready: boolean
  selectItems: (data: TData) => TItem[]
  selectTotal: (data: TData) => number
}): PagedViewData<TItem, TData> {
  const { initialData, key, tool, args, pageSize, ready, selectItems, selectTotal } = opts
  const callTool = useCallTool()
  const argsKey = JSON.stringify(args)
  const { scope, placeholderData } = useSameListPlaceholder<TData>(key)

  const page0 = useViewData<TData>(
    initialData,
    [...key, argsKey, "page0"],
    tool,
    { ...args, firstResult: 0, maxResults: pageSize },
    ready,
    { initialDataMode: "seed", placeholderData },
  )
  // `fetched` is THIS filter's page 0 (the seed until the feed answered);
  // `first` is the page on screen — the previous one of this list while the
  // new one is in flight (the placeholder) or has failed (the bridge).
  const fetched = page0.isPlaceholderData ? null : page0.data
  const first = useShownPage(page0.data, scope, page0.error !== null)
  const stale = !fetched && !!first

  const [pages, setPages] = useState<PagedState<TItem>>({
    gen: 0,
    items: [],
    exhausted: false,
    error: null,
  })
  const [loadingMore, setLoadingMore] = useState(false)

  // Render-phase reset: when the filter identity or the PAGE-0 identity
  // changes, drop accumulated pages synchronously so we never show stale rows
  // under a new page-0 result. Page-0 identity covers both a changed
  // `initialData` and a page-0 REFETCH (e.g. a mutation invalidated the
  // cache): after a refetch the rows have shifted, so keeping the appended
  // pages would duplicate or skip rows — collapsing back to one page is the
  // consistent behavior.
  const [prevReset, setPrevReset] = useState(argsKey)
  const [prevFirst, setPrevFirst] = useState<TData | null>(first)
  if (argsKey !== prevReset || first !== prevFirst) {
    setPrevReset(argsKey)
    setPrevFirst(first)
    setPages((prev) => ({ gen: prev.gen + 1, items: [], exhausted: false, error: null }))
  }

  const baseItems = useMemo(() => (first ? selectItems(first) : []), [first, selectItems])
  const items = useMemo(() => [...baseItems, ...pages.items], [baseItems, pages.items])
  const total = first ? selectTotal(first) : 0
  // The previous result belongs to another filter: no next page of it.
  const hasMore = !stale && !pages.exhausted && items.length < total

  const gen = pages.gen
  const fetchNext = useCallback(() => {
    if (!fetched || loadingMore || !callTool) return
    setLoadingMore(true)
    setPages((prev) => (prev.gen === gen ? { ...prev, error: null } : prev))
    void callTool(tool, { ...args, firstResult: items.length, maxResults: pageSize })
      .then((res) => {
        const data = parseToolResult<TData>(res)
        const pageItems = selectItems(data)
        setPages((prev) =>
          prev.gen === gen
            ? {
                ...prev,
                items: [...prev.items, ...pageItems],
                exhausted: prev.exhausted || pageItems.length < pageSize,
              }
            : prev,
        )
      })
      .catch((err: unknown) => {
        setPages((prev) =>
          prev.gen === gen
            ? { ...prev, error: err instanceof Error ? err : new Error(String(err)) }
            : prev,
        )
      })
      .finally(() => setLoadingMore(false))
  }, [fetched, loadingMore, callTool, tool, args, items.length, pageSize, selectItems, gen])

  const head = useInlineHead({ items, hasMore, fetchNext, pageSize, resetKey: argsKey })

  return {
    fit: head.fit,
    footerLabels: head.footerLabels,
    items: head.items,
    firstPage: first,
    total,
    stale,
    hasMore: head.hasMore,
    loadMore: head.loadMore,
    loading: !first && ready && page0.error === null,
    refreshing: !!first && page0.isFetching,
    loadingMore,
    // Over rows on screen, a fetch's first failed attempt already unconfirms
    // them; without rows, the guard keeps loading through the retries.
    error: page0.error ?? (first ? page0.failureReason : null),
    retry: page0.refetch,
    loadMoreError: pages.error,
  }
}

/**
 * Inline in a chat, the head of a list's rows (#396): as many as fit the
 * view's height budget (`useInlineRows`, measured). More is fullscreen where
 * the host offers it; elsewhere the next rows in place, a fetched page with
 * the click that loaded it. A new search or filter (`resetKey`) starts at the
 * head again. Without a fit (fullscreen, no host) every row.
 */
function useInlineHead<TItem>(opts: {
  items: TItem[]
  hasMore: boolean
  fetchNext: () => void
  pageSize: number
  resetKey: string
}): {
  items: TItem[]
  hasMore: boolean
  loadMore: () => void
  fit: InlineRows
  footerLabels: { loadMore: string } | undefined
} {
  const { items, hasMore, fetchNext, pageSize, resetKey } = opts
  const { expand } = useInlineBudget()
  const labels = kitLabels(useLocale())
  // A page that lands (the answer to a search, a refetch) refits on its own rows.
  const fit = useInlineRows(items.length, { resetKey, contentKey: items })
  const { cap, step, reveal } = fit
  const capped = cap !== null && items.length > cap
  const shown = useMemo(() => (capped ? items.slice(0, cap) : items), [capped, items, cap])
  const opensFullscreen = cap !== null && expand !== null
  const loadMore = useCallback(() => {
    if (opensFullscreen) return expand?.()
    if (capped) return reveal(step)
    // Every loaded row shows: fetch the next page and show it with this click.
    if (cap !== null) reveal(items.length + pageSize - cap)
    fetchNext()
  }, [opensFullscreen, expand, capped, reveal, step, cap, items.length, pageSize, fetchNext])
  return {
    items: shown,
    hasMore: capped || hasMore,
    loadMore,
    fit,
    footerLabels: opensFullscreen ? { loadMore: labels.showAll } : undefined,
  }
}
