/**
 * Decodes an MCP tool result structuredContent-first: since the widget-tool
 * "text-channel diet" the text block carries only a short model-facing summary,
 * while the data payload lives in `structuredContent` (`buildSingleWidgetView`
 * and the `rawData` feeds always set it). The text channel remains a fallback
 * for plain results from other servers. This deliberately diverges from
 * `@miragon/mcp-toolkit-ui`'s `useToolQuery`/`useToolMutation`, which still
 * parse text-first — widgets that refresh from `*_show_*` tools must use
 * `parseViewToolResult`/`useViewToolQuery` instead. Covered by tests.
 */
export function parseToolResult<T>(result: unknown): T {
  const r = result as {
    content?: Array<{ text?: string }>
    structuredContent?: unknown
    isError?: boolean
  }
  if (r?.isError) throw new Error(r.content?.[0]?.text ?? "Tool call failed")
  if (r?.structuredContent != null) return r.structuredContent as T
  const text = r?.content?.[0]?.text
  if (text) {
    try {
      return JSON.parse(text) as T
    } catch {
      return text as T
    }
  }
  return r as T
}

/** Shape of the `structuredContent` envelope emitted by the view builders. */
interface ViewEnvelope {
  context?: {
    stepIds?: string[]
    stepData?: Record<string, { data?: unknown } | undefined>
  }
}

/**
 * Decodes a `*_show_*` widget-tool result down to the widget's flat data
 * payload. `buildSingleWidgetView`/`buildComposedView` wrap the data in the
 * `McpAppView` envelope (`context.stepData[<id>].data`); this unwraps it:
 * single-step views yield the step's data directly, multi-step composed views
 * yield an object keyed by step id. Non-envelope results (e.g. `*_data`
 * feeds) pass through `parseToolResult` unchanged.
 */
export function parseViewToolResult<T>(result: unknown): T {
  const parsed = parseToolResult<unknown>(result)
  const ctx = (parsed as ViewEnvelope | null)?.context
  if (ctx?.stepData && Array.isArray(ctx.stepIds) && ctx.stepIds.length > 0) {
    if (ctx.stepIds.length === 1) return ctx.stepData[ctx.stepIds[0]]?.data as T
    return Object.fromEntries(ctx.stepIds.map((id) => [id, ctx.stepData?.[id]?.data])) as T
  }
  return parsed as T
}
