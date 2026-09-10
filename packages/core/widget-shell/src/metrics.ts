/**
 * Prometheus metrics for composed-server hosts (server path only): a scrape
 * endpoint (pull — a ServiceMonitor target, unlike the engine's OTLP push)
 * fed by three sources:
 *
 * - `mcp:tools/call` middleware → per-tool call counter + duration histogram.
 *   Tool names are a finite catalogue, so the `tool` label stays bounded;
 *   arguments, users and sessions are never labels (cardinality + PII).
 * - hono `*` middleware → HTTP request counter + duration histogram. The
 *   `route` label is folded onto the known route set (`other` for the rest)
 *   because request paths are caller-controlled.
 * - prom-client's default collectors → process/event-loop/heap gauges under
 *   their standard names (`process_*`, `nodejs_*`), which the stock Node.js
 *   Grafana dashboards expect — deliberately NOT prefixed.
 *
 * Outside mcp-use's OAuth gate like the health probes (scoped to the MCP base
 * path); front `/metrics` with network policy if the scrape must stay private.
 */
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client"
import type { HttpRouteHost } from "./health.js"
import { toolCallOutcome, toolNameOf, type ToolCallMiddlewareHost } from "./host-boot.js"

/** The slice of hono's context the HTTP middleware reads — structural, like the other host ports. */
export interface HttpMiddlewareContext {
  req: { method: string; path: string }
  res: { status: number }
}

/** `server.use("*", middleware)` — hono's catch-all middleware registration. */
export interface HttpMiddlewareHost {
  use(
    path: "*",
    handler: (ctx: HttpMiddlewareContext, next: () => Promise<void>) => Promise<void>,
  ): unknown
}

export type MetricsHost = HttpRouteHost & HttpMiddlewareHost & ToolCallMiddlewareHost

export interface MetricsOptions {
  /** Scrape route (default `/metrics`). */
  path?: string
  /** Name prefix for the server's own metrics (default `mcp_`). */
  prefix?: string
  /** Collect prom-client's process/Node.js default metrics (default true). */
  defaultMetrics?: boolean
  /** Routes kept verbatim in the `route` label; everything else is `other`. */
  routes?: readonly string[]
  /** Registry to populate (default: a fresh one — never the global registry, so hosts and tests stay isolated). */
  registry?: Registry
}

const DEFAULT_ROUTES: readonly string[] = ["/mcp", "/health", "/metrics", "/.well-known"]
const DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]

/** Exact match or a sub-path of a known route keeps its label; anything else folds into `other`. */
export function routeLabel(path: string, routes: readonly string[] = DEFAULT_ROUTES): string {
  return routes.find((route) => path === route || path.startsWith(`${route}/`)) ?? "other"
}

/**
 * Register the collectors and the scrape route. Returns the registry so a
 * host can add its own instruments or serve it elsewhere.
 *
 * Call it BEFORE registering routes that should be counted — the health
 * probes included: hono runs handlers in registration order and stops at the
 * first response, so a route registered earlier never reaches the `*`
 * middleware. The MCP transport and the OAuth discovery routes are mounted
 * by `listen()`, i.e. always after this.
 */
export function installMetrics(server: MetricsHost, options: MetricsOptions = {}): Registry {
  const {
    path = "/metrics",
    prefix = "mcp_",
    defaultMetrics = true,
    routes = DEFAULT_ROUTES,
    registry = new Registry(),
  } = options
  if (defaultMetrics) collectDefaultMetrics({ register: registry })

  const toolCalls = new Counter({
    name: `${prefix}tool_calls_total`,
    help: "MCP tools/call invocations by tool and outcome (ok | error).",
    labelNames: ["tool", "outcome"],
    registers: [registry],
  })
  const toolDuration = new Histogram({
    name: `${prefix}tool_call_duration_seconds`,
    help: "MCP tools/call handler duration in seconds.",
    labelNames: ["tool"],
    buckets: DURATION_BUCKETS,
    registers: [registry],
  })
  const httpRequests = new Counter({
    name: `${prefix}http_requests_total`,
    help: "HTTP requests by method, route and status code.",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  })
  const httpDuration = new Histogram({
    name: `${prefix}http_request_duration_seconds`,
    help: "HTTP request duration in seconds by method and route.",
    labelNames: ["method", "route"],
    buckets: DURATION_BUCKETS,
    registers: [registry],
  })

  server.use("mcp:tools/call", async (ctx, next) => {
    const tool = toolNameOf(ctx)
    const stop = toolDuration.startTimer({ tool })
    // A throwing handler never reaches the assignment below — it stays `error`.
    let outcome = "error"
    try {
      const result = await next()
      outcome = toolCallOutcome(result)
      return result
    } finally {
      stop()
      toolCalls.inc({ tool, outcome })
    }
  })

  server.use("*", async (ctx, next) => {
    const method = ctx.req.method
    const route = routeLabel(ctx.req.path, routes)
    const stop = httpDuration.startTimer({ method, route })
    // hono routes handler errors through its error handler (c.res = 500), so
    // `next()` normally resolves; the fallback covers an error escaping it.
    let status = "500"
    try {
      await next()
      status = String(ctx.res.status)
    } finally {
      stop()
      httpRequests.inc({ method, route, status })
    }
  })

  server.get(
    path,
    async () =>
      new Response(await registry.metrics(), {
        headers: { "content-type": registry.contentType, "cache-control": "no-store" },
      }),
  )

  return registry
}
