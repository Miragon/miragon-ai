import { useSeededToolQuery } from "./use-seeded-tool-query.js"

export interface ViewDataResult<T> {
  data: T | null
  /** True while self-fetching with no data yet — the first paint of a cockpit cell. */
  loading: boolean
  error: Error | null
  /**
   * A REFETCH failed while `data` is still shown: the view can no longer
   * confirm it is current (e.g. the instance ended and its runtime read is a
   * 404 now). Null while the data is the feed's latest answer.
   */
  refreshError: Error | null
  /** A refetch of shown data is in flight. */
  refreshing: boolean
  /** Re-read the feed (Retry of an error state, a manual refresh). */
  refetch: () => void
}

/**
 * The seam that lets one widget component serve both modes without a
 * duplicate UI — the widget-shell successor of the toolkit's `useViewData`,
 * built on {@link useSeededToolQuery}: standalone (a `*_show_*` widget) the
 * agent's tool result is handed in as `initialData` and becomes the SEED of
 * the feed query; embedded in the self-fetching cockpit only scope params are
 * passed and the component fetches `tool` with `args` under `key`. Either way
 * the query stays live (once `ready`), so a write's invalidation, a Retry or
 * a refresh re-reads the feed. Sibling widgets sharing `key` dedupe to one
 * call.
 */
export function useViewData<T>(
  initialData: T | null | undefined,
  key: ReadonlyArray<unknown>,
  tool: string,
  args: Record<string, unknown>,
  ready: boolean,
): ViewDataResult<T> {
  const query = useSeededToolQuery<T>(key, tool, args, { seed: initialData, enabled: ready })
  const { data, error } = query
  return {
    data,
    loading: !data && ready && !query.isError,
    error,
    refreshError: data ? error : null,
    refreshing: !!data && query.isFetching,
    refetch: query.refetch,
  }
}
