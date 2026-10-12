import type { ReactElement, ReactNode } from "react"
import { ErrorState, useLocale } from "@miragon/mcp-toolkit-ui"
import { useViewData, type UseViewDataOptions } from "@miragon/mcp-toolkit-ui/hooks"
import { describeError } from "./describe-error.js"
import { kitLabels } from "./kit-labels.js"
import { viewRefreshState } from "./view-refresh-state.js"
import { ViewDataState } from "./view-data-state.js"
import { WidgetShell } from "./widget-shell.js"

/**
 * The handed-in tool result SEEDS the feed query instead of switching it off,
 * so a write's invalidation, a Retry or a refresh re-reads a standalone view.
 */
const SEED = { initialDataMode: "seed" } as const satisfies UseViewDataOptions<unknown>

/**
 * The dual-mode detail scaffold every detail widget repeats: the toolkit's
 * `useViewData` in seed mode (handed-in `initialData` as the seed standalone,
 * self-fetch of `tool` in the cockpit) plus the shell-wrapped
 * loading/error/empty guard ({@link ViewDataState}: a skeleton under a
 * polite status, the described error with its retry). `guard` is null once
 * data is present, so a widget body reduces to:
 *
 *   const { data, guard, notice } = useDetailView<XData>({ … })
 *   if (guard) return guard
 *   // render with non-null data, `notice` on top
 *
 * `notice` is the other half: a REFETCH that failed while data is shown (a
 * write's invalidation, a refresh) — the data may be stale, so the view says
 * so in an inline warning (`ErrorState`: what failed and why, the raw reason
 * under "Details", the retry); null otherwise. `refreshError` is the same
 * fact for the view's own decisions (e.g. offering no state-changing action
 * on a state it cannot confirm), from the refetch's first failed attempt
 * ({@link viewRefreshState}). `loadError` is the failure behind the guard
 * while no data is shown — a section on a composed page hides itself when it
 * says the feed's tool is not on this server (`classifyError(…).kind`).
 */
export function useDetailView<TData>(opts: {
  initialData: TData | null | undefined
  /** Stable cache-key (e.g. ["camunda7:instance-detail", engine, id]). */
  key: ReadonlyArray<unknown>
  tool: string
  args: Record<string, unknown>
  /** Gate the self-fetch until the required scope (id/key) is present. */
  ready: boolean
  /** What is missing when the load finished without data. */
  emptyText: string
  /** The loading status for screen readers (default: the active locale's "Loading view…"). */
  loadingText?: string
  /** Shown while loading, shaped like the result (default: a heading bar and a block). */
  skeleton?: ReactNode
  /** The retry label (default: the active locale's). */
  retryText?: string
  /** Title of the stale-data notice (default: the active locale's "Couldn't refresh this view"). */
  refreshErrorTitle?: string
}): {
  data: TData | null
  guard: ReactElement | null
  notice: ReactElement | null
  refreshError: Error | null
  loadError: unknown
} {
  const locale = useLocale()
  const defaults = kitLabels(locale)
  const { initialData, key, tool, args, ready, emptyText, loadingText, skeleton, retryText } = opts
  const view = useViewData<TData>(initialData, key, tool, args, ready, SEED)
  const { data, loading, error, refetch } = view
  const retry = () => void refetch()
  const { refreshError } = viewRefreshState(view)
  const guard = data ? null : (
    <WidgetShell>
      <ViewDataState
        loading={loading}
        error={error}
        loadingText={loadingText}
        skeleton={skeleton}
        emptyText={emptyText}
        onRetry={retry}
        retryLabel={retryText}
      />
    </WidgetShell>
  )
  let notice: ReactElement | null = null
  if (refreshError) {
    const described = describeError(refreshError, locale)
    notice = (
      <ErrorState
        variant="inline"
        tone="warning"
        title={opts.refreshErrorTitle ?? defaults.refreshFailed}
        description={`${described.title}. ${defaults.refreshStale}`}
        details={described.details ?? undefined}
        onRetry={retry}
        retryLabel={retryText}
      />
    )
  }
  return { data, guard, notice, refreshError, loadError: data ? null : (error ?? null) }
}
