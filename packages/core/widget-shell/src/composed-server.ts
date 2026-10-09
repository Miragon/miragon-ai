/**
 * The composed-server boot sequence, single-sourced (server path only).
 *
 * Every composition root — the stock server, the composed-server template, a
 * customer fork — used to copy the same ~60 lines (selection → boot log →
 * `createFrameworkApp` → request context → logging → metrics → health →
 * listen → signals), and the copies drifted. This factory owns the ORDER;
 * the root keeps what is genuinely its own: the module list
 * (`composeModules`), the OAuth provider it decided to install, and its
 * runtime wiring (plugins with their shared resources, persistence).
 *
 * The order is load-bearing:
 * 1. env-typo warnings, the HTTP edge policy and the OAuth resource check —
 *    misconfiguration fails the boot before any I/O;
 * 2. ONE boot selection (`resolveBoot`, authenticated exactly when the root
 *    handed in an OAuth provider) and its boot log;
 * 3. the root's runtime (`setup(boot)` — e.g. database migrations);
 * 4. `createFrameworkApp`, then the mcp-use middleware (request context
 *    before tool-call logging before metrics) and the HTTP routes: metrics
 *    first (hono only counts routes registered after its middleware), then
 *    the Host/Origin guard, then the health probes — so `/metrics` and
 *    `/health*` stay reachable by IP-addressed scrapers and probes;
 * 5. `listen()` (production only — `mcp-use dev` owns the socket): the
 *    body-capped Node listener with request timeouts, and the graceful drain
 *    on SIGTERM/SIGINT.
 *
 * Under `mcp-use dev` the CLI also owns the `Host` check: on its loopback
 * default it admits localhost-class names plus its own live tunnel host —
 * reserved after this entry is imported, so only the CLI knows it — and
 * `--host 0.0.0.0` is its explicit, loudly warned opt-out. The guard then
 * defers its `Host` half to the CLI (else `mcp-use dev --tunnel` answers every
 * hosted-assistant call 403) and keeps the `Origin` half, which the CLI lacks.
 */
import http from "node:http"
import type { AddressInfo } from "node:net"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp, type DashboardStore } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"
import type { OAuthProvider } from "mcp-use/oauth"
import { frameworkWritesAllowed, type ModuleComposition, type ResolvedBoot } from "./composition.js"
import { installHealthEndpoints, type ReadinessCheck } from "./health.js"
import { installToolCallLogging, resolvePort, swallowDevCliViewsPrime } from "./host-boot.js"
import {
  describeHttpEdgePolicy,
  edgeRejection,
  HTTP_EDGE_ENV_VARS,
  installHttpEdgeGuard,
  resolveHttpEdgePolicy,
  type HttpEdgePolicy,
} from "./http-edge.js"
import { installMetrics } from "./metrics.js"
import { createBodyLimitedListener, type BodyLimitedListener } from "./node-listener.js"
import { installToolSchemaTrim } from "./tool-schema-trim.js"
import { installMcpRequestContext } from "./request-context.js"

/** What the server reports as `serverInfo` (plus the `instructions` it advertises). */
export interface ComposedServerInfo {
  name: string
  /** Read it from the root's `package.json` — release-please keeps that current. */
  version: string
  title?: string
  description?: string
  websiteUrl?: string
  /**
   * The root's own preamble of the server `instructions` (short, factual).
   * The active modules' snippets (`ComposableModule.instructions`) follow it,
   * so routing rules each module owns reach the model without the root
   * restating them.
   */
  instructions?: string
}

/** The root's runtime wiring, built once the boot selection is known. */
export interface ComposedServerRuntime {
  /** The active modules' plugins (plus any always-on ones, e.g. `createShellPlugin()`). */
  plugins: AppPlugin<MCPServer>[]
  /** `undefined` = the toolkit's in-memory dashboard store. */
  dashboardStore?: DashboardStore
  /** Readiness checks for the server's OWN dependencies (never engines or Prometheus). */
  readiness?: Record<string, ReadinessCheck>
  /** Releases owned resources (DB pool, timers) — runs after HTTP has drained. */
  shutdown?: () => Promise<void>
}

/** The composition members the boot needs — none depends on the root's shared-resources type. */
export type BootComposition = Pick<
  ModuleComposition<never>,
  | "warnUnknownEnvVars"
  | "resolveBoot"
  | "emitBootWarnings"
  | "logEffectiveToolsets"
  | "instructions"
>

export interface ComposedServerOptions {
  /** Log prefix, e.g. `miragon-ai`. */
  label: string
  info: ComposedServerInfo
  composition: BootComposition
  /** The compiled widget bundle (read once at boot). */
  bundle: { jsPath: string; cssPath?: string }
  setup: (boot: ResolvedBoot) => ComposedServerRuntime | Promise<ComposedServerRuntime>
  /**
   * The OAuth provider the root decided to INSTALL — the one input that makes
   * the selection authenticated (never inferred from an env var).
   */
  oauth?: OAuthProvider<unknown>
  /** Env vars consumed outside the composition (e.g. a secret named in the root's config). */
  extraKnownEnvVars?: Iterable<string>
  /**
   * Defaults to `process.env`. mcp-use reads `MCP_URL` from `process.env`
   * itself, so production passes `process.env` (tests stub it).
   */
  env?: NodeJS.ProcessEnv
}

export interface ListenOptions {
  /** Default: `PORT`, else 8400 (`resolvePort`). `0` binds an ephemeral port. */
  port?: number
  /** Default: `HOST`, else every interface (`0.0.0.0`). */
  host?: string
  /** Drain on SIGTERM/SIGINT, then exit (production entry points only). */
  handleSignals?: boolean
  /** Upper bound for in-flight requests to finish once draining (default {@link DEFAULT_DRAIN_TIMEOUT_MS}). */
  drainTimeoutMs?: number
  /**
   * Time a client gets to send a whole request, headers and body (default
   * {@link DEFAULT_REQUEST_TIMEOUT_MS}) — a slow upload cannot pin its
   * buffered body for Node's 300 s default. Responses (SSE streams, long tool
   * calls) are not bounded by it.
   */
  requestTimeoutMs?: number
}

export interface RunningServer {
  port: number
  url: string
  /**
   * Graceful drain (idempotent): stop accepting at once, let in-flight
   * requests finish (bounded — readiness answers those 503 `draining`), close
   * the MCP server, then the root's `runtime.shutdown()`. New connections are
   * refused from the first moment, so a load balancer that routes until its
   * endpoint update lands (Kubernetes) needs a `preStop` sleep in front.
   */
  shutdown(): Promise<void>
}

export interface ComposedServer {
  /** The mcp-use server — `mcp-use dev` takes it as the entry's default export. */
  app: MCPServer<unknown>
  boot: ResolvedBoot
  /** Whether the toolkit's dashboard builder is registered (`frameworkWritesAllowed`). */
  builder: boolean
  edge: HttpEdgePolicy
  /** Serve it (production path): body-capped Node listener + graceful drain. */
  listen(options?: ListenOptions): Promise<RunningServer>
}

/** Below Fly's default 5 s kill timeout and Docker's 10 s stop grace. */
export const DEFAULT_DRAIN_TIMEOUT_MS = 4000

/** Far above any MCP client's upload, far below Node's 300 s default. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

const HEALTH_PATH = "/health"
const METRICS_PATH = "/metrics"
/** The read-only operational routes: probes and scrapers reach them by container IP. */
const EXEMPT_PATHS = [HEALTH_PATH, METRICS_PATH]

/**
 * The policy the guard enforces: the resolved edge, except that under
 * `mcp-use dev` the `Host` half is the CLI's (see the module comment).
 */
function guardPolicyFor(edge: HttpEdgePolicy, env: NodeJS.ProcessEnv): HttpEdgePolicy {
  return env.MCP_USE_DEV_CLI ? { ...edge, allowedHosts: "*" } : edge
}

/**
 * mcp-use resolves the OAuth resource (RFC 8707 audience) from the provider
 * or `MCP_URL`; behind our own listener there is no localhost fallback, and a
 * missing resource would only surface as a failure on the first `/mcp` call.
 */
function assertOAuthResource(
  oauth: OAuthProvider<unknown> | undefined,
  env: NodeJS.ProcessEnv,
  label: string,
): void {
  if (oauth && oauth.resource === undefined && !env.MCP_URL?.trim()) {
    throw new Error(
      `[${label}] OAuth needs MCP_URL — the server's public base URL, which is also the token audience (RFC 8707).`,
    )
  }
}

/** The root's preamble, then every active module's snippet — blank-line separated. */
function serverInstructions(
  options: ComposedServerOptions,
  boot: ResolvedBoot,
): string | undefined {
  const parts = [options.info.instructions?.trim(), options.composition.instructions(boot)]
  const text = parts.filter((part): part is string => Boolean(part)).join("\n\n")
  return text || undefined
}

async function buildFrameworkApp(
  options: ComposedServerOptions,
  boot: ResolvedBoot,
  builder: boolean,
  runtime: ComposedServerRuntime,
): Promise<MCPServer<unknown>> {
  const { info, oauth } = options
  const { title, websiteUrl } = info
  const instructions = serverInstructions(options, boot)
  const frameworkOptions = {
    name: info.name,
    version: info.version,
    description: info.description,
    serverOptions: {
      ...(title ? { title } : {}),
      ...(websiteUrl ? { websiteUrl } : {}),
      ...(instructions ? { instructions } : {}),
    },
    // Cast: the toolkit types `plugins` unparameterized (TServer = unknown);
    // the factories return `AppPlugin<MCPServer>`, which is what the
    // framework passes at runtime.
    plugins: runtime.plugins as AppPlugin[],
    appConfig: { activeApps: boot.entries, pipelines: {} },
    app: { bundle: options.bundle, builder, dashboardStore: runtime.dashboardStore },
  }
  // Two calls because the oauth/no-oauth overloads are distinct.
  return oauth
    ? await createFrameworkApp({ ...frameworkOptions, oauth })
    : await createFrameworkApp(frameworkOptions)
}

const displayHost = (host: string): string => {
  if (host === "0.0.0.0" || host === "::") return "localhost"
  return host.includes(":") ? `[${host}]` : host
}

/** Resolves `true` when `promise` settles within `ms`, `false` on timeout. */
async function settlesWithin(promise: Promise<void>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms)
  })
  try {
    return await Promise.race([promise.then(() => true as const), timeout])
  } finally {
    clearTimeout(timer)
  }
}

interface DrainContext {
  label: string
  app: MCPServer<unknown>
  server: http.Server
  listener: BodyLimitedListener
  runtime: ComposedServerRuntime
  state: { draining: boolean }
  drainTimeoutMs: number
}

async function drain(ctx: DrainContext): Promise<void> {
  const { label, app, server, listener } = ctx
  ctx.state.draining = true
  console.info(`[${label}] Draining — ${listener.inFlight} request(s) in flight`)
  const closed = new Promise<void>((resolve) => server.close(() => resolve()))
  server.closeIdleConnections()
  if (!(await settlesWithin(listener.idle(), ctx.drainTimeoutMs))) {
    console.warn(
      `[${label}] Drain timed out after ${ctx.drainTimeoutMs}ms — closing ${listener.inFlight} request(s)`,
    )
  }
  // Closes the MCP handler (open subscription streams included) before the
  // sockets go, so streams end cleanly instead of being reset.
  await app.close().catch((error: unknown) => console.error(`[${label}] close failed:`, error))
  server.closeAllConnections()
  await closed
  await ctx.runtime.shutdown?.()
}

function installSignalHandlers(shutdown: () => Promise<void>, label: string): void {
  // `once`: a second signal during the drain kills the process the default way.
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      shutdown().then(
        () => process.exit(0),
        (error: unknown) => {
          console.error(`[${label}] shutdown failed:`, error)
          process.exit(1)
        },
      )
    })
  }
}

async function listen(
  ctx: Omit<DrainContext, "server" | "listener" | "drainTimeoutMs"> & {
    /** The policy the in-app guard enforces — the listener decides by the same one. */
    guard: HttpEdgePolicy
    env: NodeJS.ProcessEnv
  },
  options: ListenOptions,
): Promise<RunningServer> {
  const { label, app, guard, env } = ctx
  const host = options.host ?? (env.HOST?.trim() || "0.0.0.0")
  const port = options.port ?? resolvePort({ env, label })
  const listener = createBodyLimitedListener(app, {
    maxBodyBytes: guard.maxBodyBytes,
    maxInFlightBodyBytes: guard.maxInFlightBodyBytes,
    // The guard refuses these whatever their body says — never buffer it.
    refusedBeforeBody: (req) =>
      edgeRejection(
        {
          method: (req.method ?? "GET").toUpperCase(),
          path: (req.url ?? "/").split("?")[0],
          host: req.headers.host,
          origin: req.headers.origin,
        },
        guard,
        EXEMPT_PATHS,
      ) !== undefined,
    onError: (error) => console.error(`[${label}] request failed:`, error),
  })
  const requestTimeout = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const server = http.createServer(
    {
      requestTimeout,
      headersTimeout: requestTimeout,
      // Node checks the timeouts on this interval (default 30 s).
      connectionsCheckingInterval: Math.min(requestTimeout, 5000),
    },
    listener,
  )
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => {
      server.off("error", reject)
      resolve()
    })
  })
  const bound = (server.address() as AddressInfo).port
  const url = `http://${displayHost(host)}:${bound}${app.basePath}`
  console.info(`[${label}] Listening on ${url}`)

  let draining: Promise<void> | undefined
  const shutdown = (): Promise<void> =>
    (draining ??= drain({
      ...ctx,
      server,
      listener,
      drainTimeoutMs: options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS,
    }))
  if (options.handleSignals) installSignalHandlers(shutdown, label)
  return { port: bound, url, shutdown }
}

/**
 * Boot a composed server — see the module comment for the sequence. Returns
 * BEFORE listening: `mcp-use dev` serves `app` itself, production calls
 * `listen({ handleSignals: true })`.
 */
export async function createComposedServer(
  options: ComposedServerOptions,
): Promise<ComposedServer> {
  const { label, composition, oauth, env = process.env } = options
  // mcp-use ships anonymized telemetry enabled by default — an ops server
  // must not phone home unless explicitly opted in.
  process.env.MCP_USE_ANONYMIZED_TELEMETRY ??= "false"

  composition.warnUnknownEnvVars(env, [...HTTP_EDGE_ENV_VARS, ...(options.extraKnownEnvVars ?? [])])
  const edge = resolveHttpEdgePolicy(env)
  assertOAuthResource(oauth, env, label)

  const boot = composition.resolveBoot(env, { authenticated: oauth !== undefined })
  const builder = frameworkWritesAllowed(boot)
  composition.emitBootWarnings(env)
  composition.logEffectiveToolsets(boot)
  if (!builder) {
    console.info(
      `[${label}] Dashboard builder off (needs OAuth and no read-only module) — render-view stays.`,
    )
  }
  console.info(`[${label}] ${describeHttpEdgePolicy(edge)}`)
  const guard = guardPolicyFor(edge, env)
  if (guard !== edge) {
    console.info(
      `[${label}] mcp-use dev: the CLI checks Host (localhost-class + its tunnel); Origin is checked here.`,
    )
  }

  const runtime = await options.setup(boot)
  const app = await buildFrameworkApp(options, boot, builder, runtime)
  const state = { draining: false }

  // Ambient per-request info (OAuth caller, Authorization header) for the
  // consumers without a handler `ctx`; one log line per tools/call (no
  // arguments/results — they can carry credentials or PII); input schemas
  // trimmed of keys a model never needs (`$schema`, safe-integer bounds); the
  // dev-CLI views-prime workaround (no-op outside `mcp-use dev`).
  installMcpRequestContext(app)
  installToolCallLogging(app, label)
  installToolSchemaTrim(app)
  swallowDevCliViewsPrime(app, env)
  installMetrics(app, { path: METRICS_PATH, token: edge.metricsToken })
  installHttpEdgeGuard(app, guard, { exemptPaths: EXEMPT_PATHS })
  installHealthEndpoints(app, {
    path: HEALTH_PATH,
    readiness: runtime.readiness,
    label,
    draining: () => state.draining,
  })

  return {
    app,
    boot,
    builder,
    edge,
    listen: (listenOptions = {}) =>
      listen({ label, app, guard, env, runtime, state }, listenOptions),
  }
}
