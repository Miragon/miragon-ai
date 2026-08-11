/**
 * Repo-owned ambient MCP request info — the mcp-use 2.x replacement for the
 * removed `getRequestContext` AsyncLocalStorage (1.x propagated the Hono
 * request context into every handler; 2.x only hands a `ctx` to `server.tool`
 * callbacks and middleware).
 *
 * Why ambient at all: toolkit registrar handlers (`createToolRegistrar`,
 * `createWidgetToolRegistrar`) receive `(client, args)` WITHOUT a ctx, and the
 * camunda7 REST client's passthrough-auth interceptor runs deep inside a
 * hey-api call chain — neither can thread a per-call `ctx` through. This store
 * restores the 1.x semantics for exactly the three ambient consumers:
 * profile-key resolution ([[resolveProfileKey]]), the sticky engine selection
 * (`getSessionId` on the toolkit backend registry), and the passthrough bearer
 * token (`resolveMcpBearerToken`).
 *
 * Installed once per server via [[installMcpRequestContext]] (idempotent) —
 * the composition root (`index.ts` of the host app) calls it right after
 * `createFrameworkApp`. Lives on the `/server` path only: `node:async_hooks`
 * must never reach the widget bundle.
 */
import { AsyncLocalStorage } from "node:async_hooks"

/** The per-request slice the ambient consumers actually need. */
export interface McpRequestInfo {
  /** MCP session id (transport session, else the `Mcp-Session-Id` header). */
  sessionId?: string
  /** Authenticated user id (mcp-use OAuth: `auth.extra.user.userId`). */
  authUserId?: string
  /** Raw `Authorization` header value, scheme included (e.g. `Bearer …`). */
  authorization?: string
}

const storage = new AsyncLocalStorage<McpRequestInfo>()

/** The current request's info, or `undefined` outside one (stdio, boot, tests). */
export function getMcpRequestInfo(): McpRequestInfo | undefined {
  return storage.getStore()
}

/** Test seam: run `fn` under a fixed request info (mirrors 1.x `runWithContext`). */
export function runWithMcpRequestInfo<T>(info: McpRequestInfo, fn: () => T): T {
  return storage.run(info, fn)
}

/**
 * The slice of mcp-use's middleware ctx this module reads — structural (like
 * the toolkit's `RoleFilterContext`) so the exact upstream type stays out of
 * the public surface.
 */
interface MiddlewareCtxLike {
  request?: { header(name: string): string | undefined }
  session?: { sessionId?: string }
  auth?: { token?: string; extra?: { user?: unknown } }
}

function deriveInfo(ctx: MiddlewareCtxLike): McpRequestInfo {
  const header = (name: string): string | undefined => {
    try {
      return ctx.request?.header(name)
    } catch {
      return undefined
    }
  }
  // mcp-use 2 middleware auth is the SDK `AuthInfo`, with the provider-mapped
  // user under `extra.user`; its subject is `id` (2.x providers) or `userId`
  // (legacy spelling) — accept both, mirroring `resolveAuthUserId`.
  const user = ctx.auth?.extra?.user as { userId?: unknown; id?: unknown } | undefined
  const userId = [user?.userId, user?.id].find(
    (c): c is string => typeof c === "string" && c.length > 0,
  )
  return {
    sessionId: ctx.session?.sessionId ?? header("Mcp-Session-Id") ?? header("mcp-session-id"),
    authUserId: userId,
    authorization: header("Authorization") ?? header("authorization"),
  }
}

/**
 * The narrow structural server surface needed here (`server.use("mcp:*", …)`),
 * so callers can pass an `MCPServer` without this module importing mcp-use.
 */
export interface McpMiddlewareHost {
  use(pattern: "mcp:*", fn: (ctx: unknown, next: () => Promise<void>) => Promise<void>): unknown
}

const installed = new WeakSet<McpMiddlewareHost>()

/**
 * Install the ambient-request middleware on a server (idempotent). Wraps every
 * MCP method (`mcp:*`) so tool handlers, app-only feeds, and pipeline steps
 * all observe the same {@link McpRequestInfo} for the duration of the call.
 */
export function installMcpRequestContext(server: McpMiddlewareHost): void {
  if (installed.has(server)) return
  installed.add(server)
  server.use("mcp:*", (ctx, next) => {
    const mw = ctx as MiddlewareCtxLike
    // Only HTTP exchanges carry request info. Leaving the store EMPTY (not
    // `{}`) for other transports preserves the 1.x contract consumers key on:
    // "no request context at all" is the stdio/boot signal that maps profile
    // reads to the shared anonymous record (resolveProfileKey, rule 3).
    if (!mw.request && !mw.session) return next()
    return storage.run(deriveInfo(mw), () => next())
  })
}
