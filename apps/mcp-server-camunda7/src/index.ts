#!/usr/bin/env node

import path from "node:path"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"
import {
  installHealthEndpoints,
  installMcpRequestContext,
  installMetrics,
  installToolCallLogging,
  resolvePort,
  swallowDevCliViewsPrime,
} from "@miragon-ai/widget-shell/server"
import { initRuntime } from "./persistence/index.js"
import {
  emitBootWarnings,
  getAppConfig,
  getPlugins,
  logEffectiveToolsets,
  selectBoot,
  warnUnknownEnvVars,
} from "./setup.js"
import { getOAuthConfigFromEnv, oauthSecretEnvVarNames } from "./oauth.js"

// mcp-use ships anonymized server-side telemetry enabled by default — an ops
// server must not phone home unless explicitly opted in.
process.env.MCP_USE_ANONYMIZED_TELEMETRY ??= "false"

// Surface CAMUNDA_*/MCP_* typos at boot instead of silently ignoring them —
// secrets named inside MCP_OAUTH belong to the allowlist.
warnUnknownEnvVars(process.env, oauthSecretEnvVarNames())

// MCP_OAUTH turns the server into an OAuth resource server: mcp-use rejects
// /mcp requests without a valid bearer token (401 + WWW-Authenticate) and
// serves the .well-known discovery metadata. Combined with
// CAMUNDA_AUTH_TYPE=passthrough the validated token is forwarded to the
// engine per call. Parsed FIRST: whether /mcp is authenticated decides every
// module's default toolset (no suffix = the read-only floor without OAuth,
// the standard toolset with it), and a bad MCP_OAUTH fails before migrations.
const { provider: oauth } = getOAuthConfigFromEnv()

// The module selection, resolved once from the provider actually built:
// everything below derives from it.
const { boot, builder } = selectBoot(oauth)
emitBootWarnings()
logEffectiveToolsets(boot)
if (!builder) {
  console.info(
    "[miragon-ai] Dashboard builder off (needs MCP_OAUTH and no read-only module) — render-view stays.",
  )
}

// Select the persistence backends (Postgres when DATABASE_URL is set, else
// filesystem/in-memory) and run pending DB migrations before the server
// starts listening — the healthcheck grace periods cover this.
const runtime = await initRuntime()

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname

const frameworkOptions = {
  name: "miragon-ai",
  version: "0.1.0",
  host: "0.0.0.0",
  // No baseUrl since mcp-use 2: the serving origin is resolved per request
  // (or from MCP_URL, which mcp-use reads itself for offline derivations).
  // Cast: toolkit's `plugins: AppPlugin[]` is unparameterized (TServer = unknown),
  // but our plugin factories return `AppPlugin<MCPServer>`. The framework invokes
  // `registerTools(MCPServer)` at runtime, so the narrowing is sound.
  plugins: getPlugins(runtime.profileStore, boot) as AppPlugin[],
  appConfig: getAppConfig(boot),
  app: {
    // The compiled widget bundle (ES module + stylesheet — the mcp-use 2
    // native-view shape; the 1.x single-file HTML is gone). Read ONCE at
    // boot: after rebuilding the bundle, restart the host.
    bundle: {
      jsPath: path.join(DIST_DIR, "mcp-app.js"),
      cssPath: path.join(DIST_DIR, "mcp-app.css"),
    },
    // The visual builder + dashboard-persistence tools (get-builder-catalogue,
    // save/load/list/delete-dashboard) bypass every module toolset, and their
    // records are keyed by user: on only under OAuth with no read-only module
    // (`builderEnabled` in setup.ts — the e2e tests share the decision).
    builder,
    // Selected by initRuntime: Postgres when DATABASE_URL is set, filesystem
    // when MCP_DASHBOARD_DIR is set, otherwise undefined — the toolkit then
    // falls back to its in-memory store (fine for dev, lost on restart).
    dashboardStore: runtime.dashboardStore,
  },
}

if (!oauth) {
  // Without OAuth there is no caller identity: modules without an explicit
  // toolset run read-only, and — mcp-use 2 serves HTTP statelessly and issues
  // no MCP session ids — profile/settings saves (incl. the default engine,
  // `camunda7_engine` action "select") refuse per call even under a wider
  // explicit toolset (a fronting gateway can restore session scoping by
  // stamping Mcp-Session-Id). One boot line beats N puzzling tool errors.
  console.warn(
    "[miragon-ai] MCP_OAUTH is unset — modules without an explicit toolset run read-only, and user settings (incl. the default engine) cannot be saved. Set MCP_OAUTH, or widen with MCP_ACTIVE_MODULES=<module>:<toolset> (anyone who reaches this port gets that surface).",
  )
}
// Two createFrameworkApp calls because its oauth/no-oauth overloads are
// distinct (the oauth one types ctx.auth as non-nullable).
// Explicit annotation: default-exporting the instance makes its type public
// API, and the inferred type reaches into hono internals TS cannot name
// portably (TS2742). `unknown` user slot = both overloads' common shape.
const app: MCPServer<unknown> = oauth
  ? await createFrameworkApp({ ...frameworkOptions, oauth })
  : await createFrameworkApp(frameworkOptions)

// Ambient per-request info (session id, auth user, Authorization header) for
// the consumers that cannot receive a handler `ctx`: passthrough engine auth
// and profile-key resolution in registrar handlers (which also feeds the
// per-call default-engine lookup). Idempotent — the camunda7/analytics
// plugins install it too.
installMcpRequestContext(app)

// One log line per tools/call (no arguments/results — they can carry
// credentials or PII), and the dev-CLI views-prime workaround (no-op outside
// `mcp-use dev`) — both shared host boot helpers.
installToolCallLogging(app, "miragon-ai")
swallowDevCliViewsPrime(app)

// Operational HTTP routes next to /mcp — outside the OAuth gate, which is
// scoped to the MCP path: the Prometheus scrape, then Kubernetes-style probes
// (readiness covers the server's OWN dependencies, never engines or
// Prometheus — their outages are tool errors, not an unroutable server). The
// Dockerfile HEALTHCHECK, Compose and Fly all poll /health/ready. Metrics
// first: hono only counts routes registered after its middleware.
installMetrics(app)
installHealthEndpoints(app, { readiness: runtime.readiness, label: "miragon-ai" })

export default app

// `mcp-use dev` imports this entry, takes the default export, and owns the
// socket + process lifecycle itself; self-serving below stays for production
// (`node dist/index.js`) and direct `node src/index.ts` runs.
if (!process.env.MCP_USE_DEV_CLI) {
  const port = resolvePort({ label: "miragon-ai" })

  // Docker stop / Fly scale-to-zero send SIGTERM (Ctrl-C sends SIGINT): close
  // the DB pool instead of leaving Postgres to reap dead connections. `once` so
  // a second signal during shutdown still kills the process the default way.
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void runtime.shutdown().finally(() => process.exit(0))
    })
  }

  await app.listen(port)
}
