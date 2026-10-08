/**
 * The HTTP edge of a composed server (server path only): WHO may talk to it.
 *
 * DNS-rebinding protection — Origin validation is a MUST of the MCP Streamable
 * HTTP transport — as two allow-lists, resolved once per boot from the env:
 *
 * - `Host` (every request): a rebinding page reaches the server under the
 *   ATTACKER's hostname, so only hostnames the deployment owns pass —
 *   localhost-class always, plus `MCP_URL`'s host and `MCP_ALLOWED_HOSTS`.
 * - `Origin` (non-GET/HEAD requests carrying one): a browser stamps every
 *   cross-origin (and every same-origin POST) request with the page's origin;
 *   localhost-class origins, `MCP_URL`'s origin and `MCP_ALLOWED_ORIGINS`
 *   pass. Requests WITHOUT an `Origin` always pass — non-browser MCP clients
 *   (Claude Code, gateways, `mcp-remote`) never send one.
 *
 * Deliberately app-owned instead of mcp-use's `allowedHosts`/`allowedOrigins`
 * (which guard every path): probes and scrapers address a container by its
 * IP (Kubernetes, Fly), so the operational routes are exempt — see
 * {@link installHttpEdgeGuard}. The size half of the edge (the body cap) lives
 * in `node-listener.ts`; both read the one policy resolved here.
 */

/** Hostnames that always pass both checks — a loopback caller is the machine itself. */
export const LOCALHOST_HOSTNAMES: readonly string[] = ["localhost", "127.0.0.1", "[::1]"]

/** Default request-body cap (4 MiB) — far above any MCP JSON-RPC message, far below a DoS. */
export const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024

/**
 * The env vars the shared edge reads. Composition roots spread them into
 * their known-var list (typo warner, `.env.example` guards) instead of
 * re-listing them.
 */
export const HTTP_EDGE_ENV_VARS = [
  "MCP_URL",
  "MCP_ALLOWED_HOSTS",
  "MCP_ALLOWED_ORIGINS",
  "MCP_MAX_BODY_BYTES",
  "MCP_METRICS_TOKEN",
] as const

/** `"*"` switches the check off — an explicit opt-out for edges that validate themselves. */
export type AllowList = readonly string[] | "*"

export interface HttpEdgePolicy {
  /** Allowed `Host` hostnames (port-agnostic, lower-case), localhost-class first. */
  allowedHosts: AllowList
  /**
   * Allowed `Origin`s: an entry with a scheme is an exact origin
   * (`https://app.example.com`), a bare entry a hostname on any scheme/port —
   * the localhost-class entries are bare.
   */
  allowedOrigins: AllowList
  /** Request-body cap in bytes (`MCP_MAX_BODY_BYTES`). */
  maxBodyBytes: number
  /** Bearer token `/metrics` requires (`MCP_METRICS_TOKEN`); unset = open. */
  metricsToken?: string
}

function listFrom(raw: string | undefined): string[] | "*" {
  const entries = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
  return entries.includes("*") ? "*" : entries
}

function hostnameOf(entry: string, variable: string): string {
  try {
    return new URL(entry.includes("://") ? entry : `http://${entry}`).hostname
  } catch {
    throw new Error(`${variable}: "${entry}" is not a hostname`)
  }
}

function originEntryOf(entry: string, variable: string): string {
  if (!entry.includes("://")) return hostnameOf(entry, variable)
  let origin: string
  try {
    origin = new URL(entry).origin
  } catch {
    origin = "null"
  }
  if (origin === "null") throw new Error(`${variable}: "${entry}" is not an origin`)
  return origin
}

function publicUrl(raw: string | undefined): URL | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`MCP_URL "${value}" is not an absolute URL`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`MCP_URL "${value}" must be an http(s) URL`)
  }
  return url
}

function maxBodyBytesFrom(raw: string | undefined): number {
  const value = raw?.trim()
  if (!value) return DEFAULT_MAX_BODY_BYTES
  const bytes = Number(value)
  if (!Number.isSafeInteger(bytes) || bytes < 1) {
    throw new Error(`MCP_MAX_BODY_BYTES "${value}" must be a positive integer (bytes)`)
  }
  return bytes
}

function withDerived(
  list: string[] | "*",
  derived: string | undefined,
  normalize: (entry: string) => string,
): AllowList {
  if (list === "*") return "*"
  const entries = [...LOCALHOST_HOSTNAMES, ...(derived ? [derived] : []), ...list.map(normalize)]
  return [...new Set(entries)]
}

/**
 * Resolve the edge policy from the env, ONCE per boot. Invalid values fail the
 * boot instead of silently widening (or narrowing) the edge.
 */
export function resolveHttpEdgePolicy(env: NodeJS.ProcessEnv = process.env): HttpEdgePolicy {
  const url = publicUrl(env.MCP_URL)
  const metricsToken = env.MCP_METRICS_TOKEN?.trim()
  return {
    allowedHosts: withDerived(listFrom(env.MCP_ALLOWED_HOSTS), url?.hostname, (entry) =>
      hostnameOf(entry, "MCP_ALLOWED_HOSTS"),
    ),
    allowedOrigins: withDerived(listFrom(env.MCP_ALLOWED_ORIGINS), url?.origin, (entry) =>
      originEntryOf(entry, "MCP_ALLOWED_ORIGINS"),
    ),
    maxBodyBytes: maxBodyBytesFrom(env.MCP_MAX_BODY_BYTES),
    ...(metricsToken ? { metricsToken } : {}),
  }
}

const formatBytes = (bytes: number): string => {
  const [unit, size] = bytes >= 1024 * 1024 ? ["MiB", 1024 * 1024] : ["KiB", 1024]
  if (bytes < 1024) return `${bytes} bytes`
  return `${Number((bytes / size).toFixed(2))} ${unit}`
}

/** The one boot line stating the edge, so a 403 in the field is explainable from the log. */
export function describeHttpEdgePolicy(policy: HttpEdgePolicy): string {
  const list = (allowList: AllowList) =>
    allowList === "*" ? "any (validation off)" : allowList.join(", ")
  return (
    `HTTP edge — hosts: ${list(policy.allowedHosts)}; origins: ${list(policy.allowedOrigins)}; ` +
    `max body ${formatBytes(policy.maxBodyBytes)}; ` +
    `/metrics ${policy.metricsToken ? "token-protected" : "open"}`
  )
}

/** Why a `Host` header is refused, or `undefined` when it passes. */
export function hostRejection(
  host: string | undefined,
  policy: HttpEdgePolicy,
): string | undefined {
  if (policy.allowedHosts === "*") return undefined
  if (!host) return "missing Host header"
  let hostname: string
  try {
    hostname = new URL(`http://${host}`).hostname
  } catch {
    return `invalid Host header "${host}"`
  }
  if (policy.allowedHosts.includes(hostname)) return undefined
  return (
    `Host "${hostname}" is not allowed (DNS-rebinding protection). Set MCP_URL to the ` +
    `server's public URL, or add the hostname to MCP_ALLOWED_HOSTS.`
  )
}

/** Why an `Origin` header is refused, or `undefined` when it passes. */
export function originRejection(
  origin: string | undefined,
  method: string,
  policy: HttpEdgePolicy,
): string | undefined {
  if (policy.allowedOrigins === "*" || !origin) return undefined
  // Safe methods carry no side effects, and sandboxed view iframes send
  // `Origin: null` on their asset GETs (mcp-use applies the same rule).
  if (method === "GET" || method === "HEAD") return undefined
  let url: URL | undefined
  try {
    url = new URL(origin)
  } catch {
    url = undefined
  }
  const allowed =
    url !== undefined &&
    url.origin !== "null" &&
    policy.allowedOrigins.some((entry) =>
      entry.includes("://") ? entry === url.origin : entry === url.hostname,
    )
  if (allowed) return undefined
  return (
    `Origin "${origin}" is not allowed (DNS-rebinding protection). Add it to ` +
    `MCP_ALLOWED_ORIGINS if a browser app on that origin should reach this server.`
  )
}

/** A JSON-RPC-shaped error body, so MCP clients surface the reason verbatim. */
export function jsonRpcErrorBody(message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null })
}

function jsonRpcErrorResponse(status: number, message: string): Response {
  return new Response(jsonRpcErrorBody(message), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
}

/** The slice of hono's context the guard reads — structural, like the other host ports. */
export interface EdgeGuardContext {
  req: { method: string; path: string; header(name: string): string | undefined }
}

/** `server.use("*", middleware)` with a middleware that may answer itself. */
export interface EdgeGuardHost {
  use(
    path: "*",
    handler: (ctx: EdgeGuardContext, next: () => Promise<void>) => Promise<Response | void>,
  ): unknown
}

export interface EdgeGuardOptions {
  /**
   * Path prefixes answered regardless of `Host`/`Origin` — the read-only
   * operational routes, which probes and scrapers reach by container IP.
   */
  exemptPaths?: readonly string[]
}

const isExempt = (path: string, prefixes: readonly string[]): boolean =>
  prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))

/**
 * Register the Host/Origin guard on every route registered AFTER it (hono
 * runs handlers in registration order) — the MCP endpoint and the view
 * assets are mounted by mcp-use later, so they are always covered. A refused
 * request gets 403 with the reason and the env var that would admit it.
 */
export function installHttpEdgeGuard(
  server: EdgeGuardHost,
  policy: HttpEdgePolicy,
  { exemptPaths = [] }: EdgeGuardOptions = {},
): void {
  server.use("*", async (ctx, next) => {
    const { method, path } = ctx.req
    if (!isExempt(path, exemptPaths)) {
      const rejection =
        hostRejection(ctx.req.header("host"), policy) ??
        originRejection(ctx.req.header("origin"), method, policy)
      if (rejection) return jsonRpcErrorResponse(403, `Forbidden: ${rejection}`)
    }
    await next()
  })
}
