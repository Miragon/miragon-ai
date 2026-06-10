import { error } from "mcp-use/server"

/**
 * Wraps a raw `server.tool()` handler so thrown exceptions surface as the same
 * `error("[code] message")` tool result the toolkit's `createToolRegistrar`
 * produces for registrar tools (see `register-tool.js` in
 * `@miragon/mcp-toolkit-core`). Without it, widget tools and `*_data` feeds —
 * the documented exceptions that bypass the registrar — would propagate
 * exceptions raw instead of following the house "use error(), don't throw"
 * convention.
 */
export function withToolErrors<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult | ReturnType<typeof error>> {
  return async (...args) => {
    try {
      return await handler(...args)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // Same precedence as the toolkit registrar: HTTP-ish `status` first,
      // then a domain error `code` (e.g. ENGINE_NOT_SELECTED).
      const { status, code } = (e ?? {}) as { status?: string | number; code?: string | number }
      const errorCode = status ?? code
      return error(errorCode ? `[${errorCode}] ${message}` : message)
    }
  }
}
