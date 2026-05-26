import { getRequestContext } from "mcp-use/server"

const sessionEngines = new Map<string, string>()

/**
 * Reads the active MCP session id for the in-flight tool call.
 *
 * `mcp-use` ships an internal `getSessionId()` helper but it's not part of the
 * public `mcp-use/server` surface — we read the `Mcp-Session-Id` header off
 * the Hono request context that `mcp-use` propagates via AsyncLocalStorage to
 * every tool handler. Returns `undefined` for the stdio transport or when no
 * session header was negotiated (single-engine config keeps working anyway
 * because [[resolveEngine]] falls back to the lone default).
 */
function currentSessionId(): string | undefined {
  const ctx = getRequestContext()
  if (!ctx) return undefined
  return ctx.req.header("Mcp-Session-Id") ?? ctx.req.header("mcp-session-id") ?? undefined
}

/**
 * Returns the engine id selected for the current MCP session, or `undefined`
 * if none is selected yet.
 */
export function getSelectedEngine(): string | undefined {
  const sid = currentSessionId()
  return sid ? sessionEngines.get(sid) : undefined
}

/**
 * Records `engineId` as the active engine for the current MCP session.
 * Throws when there is no session in scope, which would indicate the helper
 * was invoked outside a tool-call request context (a programmer error).
 */
export function setSelectedEngine(engineId: string): void {
  const sid = currentSessionId()
  if (!sid) {
    throw new Error("No active MCP session — cannot store an engine selection")
  }
  sessionEngines.set(sid, engineId)
}

/**
 * Clears the engine selection for a given session id. Wired into
 * `mcp-use`'s idle-session cleanup so stale entries don't accumulate.
 */
export function clearSelectedEngine(sessionId: string): void {
  sessionEngines.delete(sessionId)
}
