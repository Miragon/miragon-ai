import { queryClient } from "@miragon/mcp-toolkit-ui"

/**
 * Refetch any active panel queries after a mutation so the cockpit reflects
 * server truth instead of relying solely on optimistic local state. In the
 * consolidated cockpit app the active loader query refetches; in a standalone
 * widget (data via props, no query) this is a harmless no-op.
 *
 * Relies on a single shared `queryClient` instance — guaranteed by the gateway's
 * `resolve.dedupe` of `@miragon/mcp-toolkit-ui`; without it the loaders and this
 * import would hold different clients and the refetch would miss.
 */
export function refreshCockpitData(): void {
  void queryClient.invalidateQueries()
}
