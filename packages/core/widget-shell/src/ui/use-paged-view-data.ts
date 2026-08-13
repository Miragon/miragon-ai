import { useCallback, useMemo, useState } from "react"
import { useToolQuery, useCallTool } from "@miragon/mcp-toolkit-ui"
import { parseToolResult } from "./parse-tool-result.js"

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
  /** The page-0 payload (handed-in or self-fetched) for reading list metadata. */
  firstPage: TData | null
  /** Server-reported total for the current filter (drives "X of Y" + hasMore). */
  total: number
  hasMore: boolean
  loadMore: () => void
  /** First page is still loading (self-fetch, nothing to show yet). */
  loading: boolean
  /** A subsequent page is in flight. */
  loadingMore: boolean
  error: Error | null
}

/**
 * Offset-paginated sibling of `useViewData`: one component, both modes, plus
 * "Load more". Page 0 comes from `initialData` (standalone, handed in) or a
 * self-fetch of `tool` (cockpit); `loadMore()` fetches the next offset and
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

  const page0 = useToolQuery<TData>(
    [...key, argsKey, "page0"],
    tool,
    { ...args, firstResult: 0, maxResults: pageSize },
    { enabled: !initialData && ready },
  )
  const first = initialData ?? page0.data ?? null

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
  const hasMore = !!first && !pages.exhausted && items.length < total

  const gen = pages.gen
  const loadMore = useCallback(() => {
    if (!first || loadingMore || !callTool) return
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
  }, [first, loadingMore, callTool, tool, args, items.length, pageSize, selectItems, gen])

  return {
    items,
    firstPage: first,
    total,
    hasMore,
    loadMore,
    loading: !first && ready && !page0.isError,
    loadingMore,
    error: page0.error ?? pages.error,
  }
}
