import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { useCallTool } from "@miragon/mcp-toolkit-ui"
import { parseViewToolResult } from "./parse-tool-result.js"

export interface UseViewToolQueryOptions {
  enabled?: boolean
}

/**
 * Self-fetch hook for `*_show_*` widget tools — the structuredContent-first
 * sibling of the toolkit's `useToolQuery`. Since the widget-tool text channel
 * carries only a model summary, the toolkit's text-first parsing would hand
 * widgets the summary string instead of their data; this hook decodes results
 * via `parseViewToolResult` (envelope unwrap) instead. It runs on the same
 * deduped `@tanstack/react-query` client as the toolkit hooks (see the
 * load-bearing `dedupe` array in the gateway's vite config), so sibling
 * widgets sharing a query key still collapse to a single tool call.
 *
 * `args` is appended to the effective query key — same queryKey-vs-args
 * contract as the toolkit's `useToolQuery`.
 */
export function useViewToolQuery<T>(
  queryKey: unknown[],
  toolName: string,
  args: object,
  opts?: UseViewToolQueryOptions,
): UseQueryResult<T, Error> {
  const callTool = useCallTool()

  return useQuery<T, Error>({
    queryKey: [...queryKey, args],
    queryFn: async () => {
      if (!callTool) throw new Error("callTool not available")
      const result = await callTool(toolName, args)
      return parseViewToolResult<T>(result)
    },
    enabled: !!callTool && (opts?.enabled ?? true),
  })
}
