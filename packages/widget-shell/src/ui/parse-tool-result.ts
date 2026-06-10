/**
 * Mirrors the toolkit's internal result parsing (content[0].text JSON →
 * structuredContent). This is an implicit contract with
 * `@miragon/mcp-toolkit-ui`'s `useToolQuery` / `useToolMutation`: widgets that
 * refresh themselves via `callTool` must decode results exactly the way the
 * toolkit hooks do, and `buildSingleWidgetView` emits the text channel to
 * match. Covered by tests — update them when the toolkit changes its parsing.
 */
export function parseToolResult<T>(result: unknown): T {
  const r = result as {
    content?: Array<{ text?: string }>
    structuredContent?: unknown
    isError?: boolean
  }
  if (r?.isError) throw new Error(r.content?.[0]?.text ?? "Tool call failed")
  const text = r?.content?.[0]?.text
  if (text) {
    try {
      return JSON.parse(text) as T
    } catch {
      return text as T
    }
  }
  return (r?.structuredContent ?? r) as T
}
