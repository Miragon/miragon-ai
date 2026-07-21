import { getRequestContext } from "mcp-use/server"

/**
 * The auth-carrying slice of an mcp-use tool-handler `ctx` (its second
 * argument). mcp-use populates `ctx.auth.user` from the connection's auth
 * middleware; it's absent until an auth layer is wired, which is exactly the
 * fallback {@link resolveProfileKey} handles.
 */
export interface ProfileAuthContext {
  auth?: { user?: { userId?: unknown } }
}

/**
 * Resolves the key a user profile hangs on — the single place that decides
 * "whose profile is this". Auth-ready by precedence:
 *
 *   1. the authenticated user id (`ctx.auth.user.userId`) when present, so the
 *      same code becomes a true per-user profile the moment auth is wired;
 *   2. otherwise the MCP session id (`Mcp-Session-Id` header, read off the Hono
 *      request context mcp-use propagates via AsyncLocalStorage) — the same
 *      source the toolkit's engine selection keys off, so a profile and its
 *      sticky engine share a lifetime;
 *   3. `undefined` for the stdio transport / no session negotiated — callers
 *      fall back to a fully-defaulted profile.
 *
 * Pass the tool-handler `ctx` from `server.tool(meta, (params, ctx) => …)` to
 * pick up auth; registrar handlers (no `ctx`) call it argument-less and rely on
 * the session-id path. `ctx` is typed `unknown` so the mcp-use handler context
 * (whose exact shape isn't part of the stable surface) passes without a cast at
 * the call site — the auth slice is read defensively here.
 */
export function resolveProfileKey(ctx?: unknown): string | undefined {
  const userId = (ctx as ProfileAuthContext | undefined)?.auth?.user?.userId
  if (typeof userId === "string" && userId.length > 0) return userId

  const reqCtx = getRequestContext()
  if (!reqCtx) return undefined
  return reqCtx.req.header("Mcp-Session-Id") ?? reqCtx.req.header("mcp-session-id") ?? undefined
}
