/**
 * Boot helpers shared by composed-server hosts (the stock server and the
 * composed-server template). Server path only — extracted so host apps carry
 * composition, not mcp-use workarounds, and a toolkit/mcp-use migration
 * lands here once instead of in every host fork.
 */

/**
 * The narrow structural surface needed for tool-call middleware
 * (`server.use("mcp:tools/call", …)`, the metrics counter) — callers pass an
 * `MCPServer` without this module importing mcp-use (same pattern as
 * `McpMiddlewareHost`).
 */
export interface ToolCallMiddlewareHost {
  use(
    pattern: "mcp:tools/call",
    fn: (ctx: unknown, next: () => Promise<unknown>) => Promise<unknown>,
  ): unknown
}

/** The tool name from mcp-use's tools/call middleware ctx (`unknown` when the shape is off). */
export function toolNameOf(ctx: unknown): string {
  return (ctx as { params?: { name?: string } } | undefined)?.params?.name ?? "unknown"
}

/**
 * `error` for an `isError` result (the toolkit's `withToolErrors` shape —
 * handlers report failures as results, not throws), `ok` otherwise — what the
 * metrics counter calls an error.
 */
export function toolCallOutcome(result: unknown): "ok" | "error" {
  const isError =
    typeof result === "object" &&
    result !== null &&
    (result as { isError?: unknown }).isError === true
  return isError ? "error" : "ok"
}

/**
 * mcp-use logs every request itself (one line per call: method, tool name,
 * status, duration, an error's text), at `info` without any payload. Its
 * `MCP_USE_LOG_LEVEL` raises that to `debug` (truncated tool inputs and
 * outputs) or `trace` (full request and response dumps, headers included):
 * process variables, business keys and bearer tokens then reach the log. The
 * boot says so; `undefined` at `info` or unset.
 */
export function requestLogLevelWarning(env: NodeJS.ProcessEnv): string | undefined {
  const level = env.MCP_USE_LOG_LEVEL?.trim().toLowerCase()
  if (level !== "debug" && level !== "trace") return undefined
  return level === "trace"
    ? "MCP_USE_LOG_LEVEL=trace — mcp-use logs every request and response in full, headers (bearer tokens) included. For debugging only."
    : "MCP_USE_LOG_LEVEL=debug — mcp-use logs tool inputs and outputs (process variables, business keys) on every call. For debugging only."
}

/**
 * `mcp-use dev` imports the host entry, takes the default export, and owns
 * the socket itself. It also primes its own (empty — hosts bundle views via
 * `app.bundle`) views manifest onto the export, which mcp-use rejects as a
 * double prime. Swallow the CLI's prime; scoped to the dev CLI (the env var
 * it sets before loading the entry) so a genuine double-prime still fails
 * loudly.
 */
export function swallowDevCliViewsPrime(
  server: object,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!env.MCP_USE_DEV_CLI) return
  ;(server as { __primeViews: () => void }).__primeViews = () => {}
}

export interface ResolvePortOptions {
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
  /** Port to bind when `PORT` is unset or empty (default 8400). */
  fallback?: number
  /** Host label, prefixed onto the error so it reads like the host's other boot lines. */
  label?: string
}

/**
 * `PORT` from the environment, validated. `||` (not `??`) on purpose: an
 * empty `PORT=` assignment from an env_file must fall back to the default —
 * `Number("")` is 0, which would bind a random OS-assigned port.
 */
export function resolvePort({
  env = process.env,
  fallback = 8400,
  label,
}: ResolvePortOptions = {}): number {
  const port = Number(env.PORT?.trim() || fallback)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const prefix = label ? `[${label}] ` : ""
    throw new Error(`${prefix}invalid PORT "${env.PORT}" — expected an integer 1-65535`)
  }
  return port
}
