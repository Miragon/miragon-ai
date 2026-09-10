/**
 * HTTP health endpoints for composed-server hosts (server path only).
 *
 * Kubernetes-style split: `<path>/live` answers as soon as the process serves
 * HTTP (only a wedged event loop fails it); `<path>/ready` additionally runs
 * the host's readiness checks — the server's OWN dependencies (the profile/
 * dashboard database), deliberately never the engines or Prometheus: those
 * are upstreams whose outages the tools report as error results, and taking
 * the server out of rotation for them would turn a visible error into a
 * silent absence. The bare `<path>` aliases readiness for probes that know
 * only one URL (Docker HEALTHCHECK, Fly, Compose `service_healthy`).
 *
 * Outside mcp-use's OAuth gate by construction: the bearer check is scoped
 * to the MCP base path, so probes need no token.
 */

/**
 * The narrow structural route surface (`server.get(path, handler)`) — hosts
 * pass an `MCPServer` without this module importing mcp-use or hono. Handlers
 * return Web-standard `Response`s, which hono passes through untouched.
 */
export interface HttpRouteHost {
  get(path: string, handler: (ctx: unknown) => Response | Promise<Response>): unknown
}

/** Resolves when the dependency is usable; throws or rejects when it is not. */
export type ReadinessCheck = () => void | Promise<void>

export interface HealthOptions {
  /** Route prefix (default `/health` → `/health`, `/health/live`, `/health/ready`). */
  path?: string
  /** Named readiness checks; every one must pass for `ready` to answer 200. */
  readiness?: Record<string, ReadinessCheck>
  /** Per-check budget in ms (default 2000) — a hung dependency must fail the probe, not hang it. */
  timeoutMs?: number
  /** Log prefix for failed checks (default `health`). */
  label?: string
}

export type HealthStatus = "up" | "down"

/** The readiness body: the overall verdict plus one entry per check. */
export interface HealthReport {
  status: HealthStatus
  checks: Record<string, HealthStatus>
}

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  })

async function withTimeout(check: ReadinessCheck, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    timer.unref()
  })
  try {
    // `.then(check)` turns a synchronous throw into a rejection like any other.
    await Promise.race([Promise.resolve().then(check), timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function runReadinessChecks(
  checks: Record<string, ReadinessCheck>,
  timeoutMs: number,
  label: string,
): Promise<HealthReport> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]): Promise<[string, HealthStatus]> => {
      try {
        await withTimeout(check, timeoutMs)
        return [name, "up"]
      } catch (error) {
        // The reason goes to the log, not the (unauthenticated) response body.
        console.warn(`[${label}] readiness check "${name}" failed:`, error)
        return [name, "down"]
      }
    }),
  )
  const status: HealthStatus = entries.every(([, s]) => s === "up") ? "up" : "down"
  return { status, checks: Object.fromEntries(entries) }
}

/**
 * Register `<path>/live`, `<path>/ready` and `<path>` (= ready). Readiness
 * answers 200 with `{ status: "up", checks }` or 503 with `status: "down"`
 * and the failing checks marked; the checks run in parallel, each under
 * `timeoutMs`. Register `installMetrics` first if probe traffic should show
 * up in the HTTP metrics (hono only wraps routes registered after the
 * middleware).
 */
export function installHealthEndpoints(server: HttpRouteHost, options: HealthOptions = {}): void {
  const { path = "/health", readiness = {}, timeoutMs = 2000, label = "health" } = options
  const live = (): Response => jsonResponse(200, { status: "up" })
  const ready = async (): Promise<Response> => {
    const report = await runReadinessChecks(readiness, timeoutMs, label)
    return jsonResponse(report.status === "up" ? 200 : 503, report)
  }
  server.get(`${path}/live`, live)
  server.get(`${path}/ready`, ready)
  server.get(path, ready)
}
