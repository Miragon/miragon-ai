/**
 * Repo-owned ambient MCP request info — for the few consumers that run
 * WITHOUT a tool-handler `ctx` in hand.
 *
 * Since toolkit 2.6 every handler gets mcp-use's `ctx` (registrar handlers as
 * their third argument, raw `server.tool` callbacks as their second), and
 * caller identity resolves from it ([[resolveProfileKey]] reads `ctx.auth`
 * first). What remains ctx-less: pipeline steps (`render-view` /
 * `refresh-view` hand a step no `ctx`, so a step's saved-default-engine
 * lookup reads the caller here) and the camunda7 REST client's
 * passthrough-auth interceptor, which runs deep inside a hey-api call chain
 * (`resolveMcpBearerToken`). This store carries exactly what those need: the
 * OAuth caller's id and the raw `Authorization` header — nothing a client can
 * pick for itself becomes an identity here.
 *
 * Fail-closed by construction: outside a request — or when no middleware was
 * installed — there is no store, and no store means NO identity (saves
 * refuse, reads fall back to defaults), never a shared record.
 *
 * Installed once per server via [[installMcpRequestContext]] (idempotent) —
 * `createComposedServer` does it right after `createFrameworkApp`. Lives on
 * the `/server` path only: `node:async_hooks` must never reach the widget
 * bundle.
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { resolveCallerId } from "@miragon/mcp-toolkit-core"

/** The per-request slice the ctx-less consumers actually need. */
export interface McpRequestInfo {
  /** The OAuth caller's id, read off the request's auth like `resolveCaller` does. */
  authUserId?: string
  /**
   * Declares the request's caller as THE single local user of a transport
   * without auth (stdio, tests) — it resolves to `ANONYMOUS_PROFILE_KEY`.
   * Never derived from a request: the HTTP middleware does not set it, so
   * only code that runs work under [[runWithMcpRequestInfo]] can declare it.
   */
  anonymousCaller?: boolean
  /** Raw `Authorization` header value, scheme included (e.g. `Bearer …`). */
  authorization?: string
}

const storage = new AsyncLocalStorage<McpRequestInfo>()

/** The current request's info, or `undefined` outside one (boot, tests, no middleware). */
export function getMcpRequestInfo(): McpRequestInfo | undefined {
  return storage.getStore()
}

/**
 * Run `fn` under a fixed request info — the test seam, and the only way to
 * declare an `anonymousCaller` (a transport without auth that serves exactly
 * one local user).
 */
export function runWithMcpRequestInfo<T>(info: McpRequestInfo, fn: () => T): T {
  return storage.run(info, fn)
}

/**
 * The slice of mcp-use's middleware ctx this module reads — structural (like
 * the toolkit's `RoleFilterContext`) so the exact upstream type stays out of
 * the public surface. `auth` is read through the toolkit's `resolveCaller`,
 * which knows the middleware shape (`auth.extra.user`).
 */
interface MiddlewareCtxLike {
  request?: { header(name: string): string | undefined }
  auth?: unknown
}

function deriveInfo(ctx: MiddlewareCtxLike): McpRequestInfo {
  const header = (name: string): string | undefined => {
    try {
      return ctx.request?.header(name)
    } catch {
      return undefined
    }
  }
  return {
    authUserId: resolveCallerId(ctx),
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
  server.use("mcp:*", (ctx, next) => storage.run(deriveInfo(ctx as MiddlewareCtxLike), next))
}
