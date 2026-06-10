import { getRequestContext } from "mcp-use/server"

/**
 * How long a session's engine selection survives without being re-set.
 * `mcp-use` exposes no session-close hook to plugins, so without eviction the
 * module-global map below would grow with every MCP session that ever selected
 * an engine via `camunda7_engine`. 24h comfortably outlives any real session.
 */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000

interface SessionSelection {
  engineId: string
  selectedAt: number
}

const sessionEngines = new Map<string, SessionSelection>()

function isExpired(entry: SessionSelection, now: number): boolean {
  return now - entry.selectedAt > SESSION_TTL_MS
}

/** Drops every selection older than {@link SESSION_TTL_MS}. */
function sweepExpired(now: number): void {
  for (const [sid, entry] of sessionEngines) {
    if (isExpired(entry, now)) {
      sessionEngines.delete(sid)
    }
  }
}

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
 * if none is selected yet or the selection has outlived {@link SESSION_TTL_MS}.
 */
export function getSelectedEngine(): string | undefined {
  const sid = currentSessionId()
  if (!sid) return undefined
  const entry = sessionEngines.get(sid)
  if (!entry) return undefined
  if (isExpired(entry, Date.now())) {
    sessionEngines.delete(sid)
    return undefined
  }
  return entry.engineId
}

/**
 * Records `engineId` as the active engine for the current MCP session and
 * opportunistically sweeps expired selections (the only periodic write path,
 * so the map stays bounded without a timer).
 * Throws when there is no session in scope, which would indicate the helper
 * was invoked outside a tool-call request context (a programmer error).
 */
export function setSelectedEngine(engineId: string): void {
  const sid = currentSessionId()
  if (!sid) {
    throw new Error("No active MCP session — cannot store an engine selection")
  }
  sweepExpired(Date.now())
  sessionEngines.set(sid, { engineId, selectedAt: Date.now() })
}

/**
 * Clears the engine selection for a given session id. Nothing calls this
 * automatically — `mcp-use` exposes no idle-session cleanup hook to plugins —
 * so stale entries are evicted by the TTL sweep in {@link setSelectedEngine}
 * (plus lazy expiry on read) instead. Kept for tests and a future explicit
 * session-close hook.
 */
export function clearSelectedEngine(sessionId: string): void {
  sessionEngines.delete(sessionId)
}
