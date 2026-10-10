import type { ReactElement } from "react"
import { Alert, AlertDescription, Button, useLocale } from "@miragon/mcp-toolkit-ui"
import { kitLabels } from "./kit-labels.js"
import { useViewData } from "./use-view-data.js"
import { ViewDataState } from "./view-data-state.js"
import { WidgetShell } from "./widget-shell.js"

/**
 * The dual-mode detail scaffold every detail widget repeats: `useViewData`
 * (handed-in `initialData` as the seed standalone, self-fetch of `tool` in the
 * cockpit) plus the shell-wrapped loading/error/empty guard, whose error
 * carries a Retry. `guard` is null once data is present, so a widget body
 * reduces to:
 *
 *   const { data, guard, notice } = useDetailView<XData>({ … })
 *   if (guard) return guard
 *   // render with non-null data, `notice` on top
 *
 * `notice` is the other half: a REFETCH that failed while data is shown (a
 * write's invalidation, a refresh) — the data may be stale, so the view says
 * so and offers the Retry; null otherwise. `refreshError` is the same fact for
 * the view's own decisions (e.g. offering no state-changing action on a state
 * it cannot confirm).
 */
export function useDetailView<TData>(opts: {
  initialData: TData | null | undefined
  /** Stable cache-key (e.g. ["camunda7:instance-detail", engine, id]). */
  key: ReadonlyArray<unknown>
  tool: string
  args: Record<string, unknown>
  /** Gate the self-fetch until the required scope (id/key) is present. */
  ready: boolean
  /** Caller-localized texts for the guard states. */
  loadingText: string
  emptyText: string
  /** The Retry label (default: the active locale's). */
  retryText?: string
  /**
   * The stale-data notice line; receives the failed refetch's message
   * (default: the active locale's).
   */
  refreshErrorText?: (message: string) => string
}): {
  data: TData | null
  guard: ReactElement | null
  notice: ReactElement | null
  refreshError: Error | null
} {
  const defaults = kitLabels(useLocale())
  const {
    initialData,
    key,
    tool,
    args,
    ready,
    loadingText,
    emptyText,
    retryText = defaults.retry,
    refreshErrorText = defaults.refreshFailed,
  } = opts
  const { data, loading, error, refreshError, refetch } = useViewData<TData>(
    initialData,
    key,
    tool,
    args,
    ready,
  )
  const guard = data ? null : (
    <WidgetShell>
      <ViewDataState
        loading={loading}
        error={error}
        loadingText={loadingText}
        emptyText={emptyText}
        onRetry={refetch}
        retryLabel={retryText}
      />
    </WidgetShell>
  )
  const notice = refreshError ? (
    <Alert role="alert">
      <AlertDescription>
        <span>{refreshErrorText(refreshError.message)}</span>
        <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={refetch}>
          {retryText}
        </Button>
      </AlertDescription>
    </Alert>
  ) : null
  return { data, guard, notice, refreshError }
}
