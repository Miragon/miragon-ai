import { useCallback, useMemo, useState } from "react"
import { useCallTool } from "@miragon/mcp-toolkit-ui"
import { parseToolResult } from "./parse-tool-result.js"
import { useSeededToolQuery } from "./use-seeded-tool-query.js"

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
  /** Accumulated items across all loaded pages. */
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
   * caller's guard renders; with one, the rows on screen are stale (the
   * previous filter's, or the last good refetch) — {@link retry} re-runs page 0.
   */
  error: Error | null
  /** Re-runs the page-0 fetch: the retry for {@link error}. */
  retry: () => void
  /** The last load-more failure — `loadMore` retries it; the rows above are current. */
  loadMoreError: Error | null
}

/** The last page 0 that landed, tagged with the list (cache-key scope) it belongs to. */
interface SettledPage<TData> {
  scope: string
  data: TData
}

/**
 * Keep-previous-data (render phase, state — never a ref): a changed search or
 * filter keys a new page 0 whose data is undefined until it lands (a seed is
 * only ever the unfiltered page 0), and the toolkit's useToolQuery forwards
 * no `placeholderData`. Without this the caller's loading guard would unmount
 * the list — and the search box the operator is typing into — for every
 * round-trip. Only within ONE list
 * (`scope`, the cache-key prefix): another engine or definition never shows
 * the previous list's rows.
 */
function useKeptPage<TData>(fetched: TData | null, scope: string): TData | null {
  const [settled, setSettled] = useState<SettledPage<TData> | null>(null)
  if (fetched && (settled?.data !== fetched || settled.scope !== scope)) {
    setSettled({ scope, data: fetched })
  }
  return fetched ?? (settled?.scope === scope ? settled.data : null)
}

/**
 * Offset-paginated sibling of `useViewData`: one component, both modes, plus
 * "Load more". Page 0 is the feed query, seeded with `initialData` (standalone,
 * handed in) or self-fetched (cockpit); `loadMore()` fetches the next offset and
 * appends. Changing `args` (e.g. a server-side search/filter) resets pagination
 * to page 0. The feed must accept `firstResult`/`maxResults` and return the full
 * filtered `total` so the footer is honest and `hasMore` is correct.
 *
 * Deliberately explicit (button-driven), not infinite scroll — see {@link ListFooter}.
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

  // A handed-in page 0 SEEDS the query (it is never switched off), so a
  // write's invalidation refetches a standalone list too.
  const page0 = useSeededToolQuery<TData>(
    [...key, argsKey, "page0"],
    tool,
    { ...args, firstResult: 0, maxResults: pageSize },
    { seed: initialData, enabled: ready },
  )
  // `fetched` is THIS filter's page 0 (the seed until the feed answered);
  // `first` keeps the previous one on screen while it is in flight or has
  // failed (`stale`).
  const fetched = page0.data
  const first = useKeptPage(fetched, JSON.stringify(key))
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
  const loadMore = useCallback(() => {
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

  return {
    items,
    firstPage: first,
    total,
    stale,
    hasMore,
    loadMore,
    loading: !first && ready && !page0.isError,
    refreshing: !!first && page0.isFetching,
    loadingMore,
    error: page0.error,
    retry: page0.refetch,
    loadMoreError: pages.error,
  }
}
