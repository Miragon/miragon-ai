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
 * Shared fallback key for transports without any request context (stdio,
 * tests). Deliberately used by BOTH the read and the write path — a keyless
 * save persists under this record and is read back on the next load, so a
 * local stdio user gets one working (shared) profile instead of write-only
 * saves that never surface again. HTTP requests missing a session id do NOT
 * map here (see {@link resolveProfileKey}).
 */
export const ANONYMOUS_PROFILE_KEY = "anonymous"

/**
 * Resolves the key a user profile hangs on — the single place that decides
 * "whose profile is this". Auth-ready by precedence:
 *
 *   1. the authenticated user id — from the tool-handler `ctx.auth.user.userId`
 *      when a `ctx` is passed, otherwise from the `auth` variable on the Hono
 *      request context (the exact object mcp-use derives `ctx.auth` from), so
 *      registrar handlers without a `ctx` still resolve the auth user;
 *   2. otherwise the MCP session id (`Mcp-Session-Id` header, read off the Hono
 *      request context mcp-use propagates via AsyncLocalStorage) — the same
 *      source the toolkit's engine selection keys off, so a profile and its
 *      sticky engine share a lifetime;
 *   3. {@link ANONYMOUS_PROFILE_KEY} when there is NO request context at all
 *      (stdio transport, tests) — the deliberate shared record;
 *   4. `undefined` for an HTTP request WITHOUT a session id — deliberately NOT
 *      the shared record, so unrelated keyless clients never cross-share one
 *      profile: reads fall back to defaults, saves fail visibly.
 *
 * `ctx` is typed `unknown` so the mcp-use handler context (whose exact shape
 * isn't part of the stable surface) passes without a cast at the call site —
 * the auth slice is read defensively here.
 */
export function resolveProfileKey(ctx?: unknown): string | undefined {
  const ctxUserId = (ctx as ProfileAuthContext | undefined)?.auth?.user?.userId
  if (typeof ctxUserId === "string" && ctxUserId.length > 0) return ctxUserId

  const reqCtx = getRequestContext()
  if (!reqCtx) return ANONYMOUS_PROFILE_KEY

  try {
    const auth = (reqCtx as { get(key: string): unknown }).get("auth") as
      | ProfileAuthContext["auth"]
      | undefined
    const userId = auth?.user?.userId
    if (typeof userId === "string" && userId.length > 0) return userId
  } catch {
    // Context-variable access is best-effort — fall through to the session id.
  }

  return reqCtx.req.header("Mcp-Session-Id") ?? reqCtx.req.header("mcp-session-id") ?? undefined
}
