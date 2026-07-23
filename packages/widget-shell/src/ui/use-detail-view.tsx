import type { ReactElement } from "react"
import { useViewData } from "@miragon/mcp-toolkit-ui/hooks"
import { ViewDataState } from "./view-data-state.js"
import { WidgetShell } from "./widget-shell.js"

/**
 * The dual-mode detail scaffold every detail widget repeats: `useViewData`
 * (handed-in `initialData` standalone, self-fetch of `tool` in the cockpit)
 * plus the shell-wrapped loading/error/empty guard. `guard` is null once data
 * is present, so a widget body reduces to:
 *
 *   const { data, guard } = useDetailView<XData>({ … })
 *   if (guard) return guard
 *   // render with non-null data
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
}): { data: TData | null; guard: ReactElement | null } {
  const { initialData, key, tool, args, ready, loadingText, emptyText } = opts
  const { data, loading, error } = useViewData<TData>(initialData, key, tool, args, ready)
  const guard = data ? null : (
    <WidgetShell>
      <ViewDataState
        loading={loading}
        error={error}
        loadingText={loadingText}
        emptyText={emptyText}
      />
    </WidgetShell>
  )
  return { data, guard }
}
