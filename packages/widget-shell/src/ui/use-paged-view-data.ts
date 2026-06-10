import { useCallback, useMemo, useRef, useState } from "react"
import { useToolQuery, useCallTool } from "@miragon/mcp-toolkit-ui"
import { parseToolResult } from "./parse-tool-result.js"

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

  const [extra, setExtra] = useState<TItem[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<Error | null>(null)

  // Latest filter identity, readable from an in-flight loadMore closure so a page
  // that resolves after the filter changed can be discarded (see loadMore).
  const argsKeyRef = useRef(argsKey)

  // Render-phase reset: when the filter identity (or handed-in data) changes,
  // drop accumulated pages synchronously so we never show stale rows under a new
  // page-0 result.
  const [prevReset, setPrevReset] = useState(argsKey)
  if (argsKey !== prevReset) {
    setPrevReset(argsKey)
    setExtra([])
    setMoreError(null)
    argsKeyRef.current = argsKey
  }

  const baseItems = useMemo(() => (first ? selectItems(first) : []), [first, selectItems])
  const items = useMemo(() => [...baseItems, ...extra], [baseItems, extra])
  const total = first ? selectTotal(first) : 0
  const hasMore = !!first && items.length < total

  const loadMore = useCallback(() => {
    if (!first || loadingMore || !callTool) return
    // Pin the filter this page belongs to; if it changes mid-flight, the resolved
    // page is for the old filter and must NOT be appended onto the reset list.
    const requestArgsKey = argsKey
    setLoadingMore(true)
    void callTool(tool, { ...args, firstResult: items.length, maxResults: pageSize })
      .then((res) => {
        if (requestArgsKey !== argsKeyRef.current) return
        const data = parseToolResult<TData>(res)
        setExtra((prev) => [...prev, ...selectItems(data)])
      })
      .catch((err: unknown) => {
        if (requestArgsKey !== argsKeyRef.current) return
        setMoreError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => setLoadingMore(false))
  }, [first, loadingMore, callTool, tool, args, argsKey, items.length, pageSize, selectItems])

  return {
    items,
    firstPage: first,
    total,
    hasMore,
    loadMore,
    loading: !first && ready && !page0.isError,
    loadingMore,
    error: page0.error ?? moreError,
  }
}
