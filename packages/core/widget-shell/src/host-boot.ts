/**
 * Boot helpers shared by composed-server hosts (the stock server and the
 * composed-server template). Server path only — extracted so host apps carry
 * composition, not mcp-use workarounds, and a toolkit/mcp-use migration
 * lands here once instead of in every host fork.
 */

/**
 * The narrow structural surface needed for tool-call middleware
 * (`server.use("mcp:tools/call", …)`) — callers pass an `MCPServer` without
 * this module importing mcp-use (same pattern as `McpMiddlewareHost`).
 */
export interface ToolCallMiddlewareHost {
  use(
    pattern: "mcp:tools/call",
    fn: (ctx: unknown, next: () => Promise<unknown>) => Promise<unknown>,
  ): unknown
}

/**
 * One log line per tools/call with tool name, duration, and outcome.
 * Arguments and results are deliberately not logged — they can carry
 * credentials or PII (e.g. process variables).
 */
export function installToolCallLogging(server: ToolCallMiddlewareHost, label: string): void {
  server.use("mcp:tools/call", async (ctx, next) => {
    const toolName = (ctx as { params?: { name?: string } } | undefined)?.params?.name ?? "unknown"
    const start = Date.now()
    try {
      const result = await next()
      const isError =
        typeof result === "object" &&
        result !== null &&
        (result as { isError?: unknown }).isError === true
      console.log(
        `[${label}] tools/call ${toolName} ${isError ? "error" : "ok"} in ${Date.now() - start}ms`,
      )
      return result
    } catch (error) {
      console.log(`[${label}] tools/call ${toolName} error in ${Date.now() - start}ms`)
      throw error
    }
  })
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
