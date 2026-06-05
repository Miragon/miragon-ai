import { useToolQuery } from "@miragon/mcp-toolkit-ui"

export interface ViewDataResult<T> {
  data: T | null
  /** True while self-fetching with no data yet — the cockpit's first paint. */
  loading: boolean
  error: Error | null
}

/**
 * The seam that lets one component serve both modes without duplicate UIs.
 *
 * Standalone (a `show_*` widget) the agent's tool result is handed in via
 * `initialData` (from the view's stepData) and returned verbatim. Inside the
 * cockpit only scope params are passed, so the component self-fetches `tool`
 * with `args` under `key` — disabled unless data is absent AND `ready` (i.e. the
 * required id is present). Sibling widgets sharing `key` dedupe to a single
 * call, so a composed cockpit view of N widgets on one data feed fetches once.
 */
export function useViewData<T>(
  initialData: T | null | undefined,
  key: ReadonlyArray<unknown>,
  tool: string,
  args: Record<string, unknown>,
  ready: boolean,
): ViewDataResult<T> {
  const query = useToolQuery<T>([...key], tool, args, { enabled: !initialData && ready })
  const data = initialData ?? query.data ?? null
  return { data, loading: !data && ready && !query.isError, error: query.error ?? null }
}
