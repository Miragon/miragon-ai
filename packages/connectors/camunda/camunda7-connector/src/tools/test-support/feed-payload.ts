import { parseToolResult } from "@miragon/mcp-toolkit-ui"

/**
 * A tool result's payload as a widget reads it: `structuredContent` when the
 * result carries one (a show view, a save), else the JSON text an app-only
 * feed answers in (`buildDataFeedResult`). Tests read results through this,
 * never `structuredContent` directly, so they hold whichever channel a tool
 * uses.
 */
export const feedPayload = <T = Record<string, unknown>>(result: unknown): T =>
  parseToolResult<T>(result)
