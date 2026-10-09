import { getMcpRequestInfo } from "@miragon-ai/widget-shell/server"

/**
 * Resolves the bearer token of the MCP request currently being handled — the
 * token provider for `authType: "passthrough"`, where the credential each MCP
 * client presents to this server is forwarded to the engine per call, so the
 * engine enforces the caller's own permissions.
 *
 * Reads the raw `Authorization` header off the repo-owned ambient request
 * info (`getMcpRequestInfo`, `@miragon-ai/widget-shell/server`) — the
 * AsyncLocalStorage installed once per server via `installMcpRequestContext`
 * (the host and this plugin's `registerTools` both install it): this
 * interceptor runs deep inside a hey-api call chain, with no handler `ctx` in
 * reach. Every engine call in this module happens inside a `tools/call`
 * request — including widget `*_data` feeds and pipeline steps, which the
 * host performs over its own MCP connection — so the context is present
 * whenever it matters.
 *
 * Returns the token without the `Bearer ` scheme prefix. `undefined` when
 * there is no request context (boot, a missing install), no `Authorization`
 * header (e.g. the inspector without OAuth), or a non-Bearer scheme — callers
 * then hit the engine unauthenticated and surface its 401. That guardrail
 * presumes the engine has REST authentication enabled; a default Camunda 7 /
 * CIB Seven engine accepts anonymous requests and ignores the token entirely.
 *
 * Note: were a handler ever to suspend across requests (`ctx.elicit` /
 * `ctx.sample` — none does today), the continuation would resume under the
 * ORIGINAL request's context and thus the original token.
 */
export function resolveMcpBearerToken(): string | undefined {
  const header = getMcpRequestInfo()?.authorization
  if (!header) return undefined
  const match = /^Bearer\s+(\S.*)$/i.exec(header.trim())
  return match ? match[1] : undefined
}
