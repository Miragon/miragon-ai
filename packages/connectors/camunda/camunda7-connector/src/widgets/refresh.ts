import { queryClient } from "@miragon/mcp-toolkit-ui"

/**
 * The cockpit's manual Refresh: re-read every module data feed the open view
 * shows (and mark the rest stale), so agent-executed remediations and other
 * sessions' writes become visible without reopening the cockpit — and a view
 * stuck in an error state gets its retry. In-widget writes do NOT use this:
 * `useEngineAction` invalidates exactly what its write changed
 * (`WRITE_POLICY`).
 *
 * Relies on a single shared `queryClient` instance — guaranteed by the server's
 * `resolve.dedupe` of `@miragon/mcp-toolkit-ui`; without it the loaders and this
 * import would hold different clients and the refetch would miss.
 */
export function refreshCockpitData(): Promise<void> {
  // Only the module data feeds — a blanket invalidateQueries() would also
  // refetch host/profile plumbing and deployment config (the widget-actions
  // feed) for nothing.
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const root = query.queryKey[0]
      return (
        typeof root === "string" && (root.startsWith("camunda7:") || root.startsWith("analytics:"))
      )
    },
  })
}
