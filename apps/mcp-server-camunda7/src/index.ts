#!/usr/bin/env node

import path from "node:path"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"
import { installMcpRequestContext } from "@miragon-ai/widget-shell/server"
import { initRuntime } from "./persistence/index.js"
import { emitBootWarnings, getAppConfig, getPlugins, warnUnknownEnvVars } from "./setup.js"
import { getOAuthConfigFromEnv, oauthSecretEnvVarNames } from "./oauth.js"

// mcp-use ships anonymized telemetry (PostHog + Scarf) enabled by default —
// an ops server must not phone home unless explicitly opted in.
process.env.MCP_USE_ANONYMIZED_TELEMETRY ??= "false"

// Surface CAMUNDA_*/MCP_* typos at boot instead of silently ignoring them —
// secrets named inside MCP_OAUTH belong to the allowlist.
warnUnknownEnvVars(process.env, oauthSecretEnvVarNames())
emitBootWarnings()

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
  plugins: getPlugins(runtime.profileStore) as AppPlugin[],
  appConfig: getAppConfig(),
  app: {
    // The compiled widget bundle (ES module + stylesheet — the mcp-use 2
    // native-view shape; the 1.x single-file HTML is gone). Read ONCE at
    // boot: after rebuilding the bundle, restart the host.
    bundle: {
      jsPath: path.join(DIST_DIR, "mcp-app.js"),
      cssPath: path.join(DIST_DIR, "mcp-app.css"),
    },
    // Toolkit 0.4.0 made the visual builder + dashboard-persistence tools
    // (get-builder-catalogue, save/load/list/delete-dashboard) opt-in, defaulting
    // off. We keep them on to preserve the server's tool surface.
    builder: true,
    // Selected by initRuntime: Postgres when DATABASE_URL is set, filesystem
    // when MCP_DASHBOARD_DIR is set, otherwise undefined — the toolkit then
    // falls back to its in-memory store (fine for dev, lost on restart).
    dashboardStore: runtime.dashboardStore,
  },
}

// MCP_OAUTH turns the server into an OAuth resource server: mcp-use rejects
// /mcp requests without a valid bearer token (401 + WWW-Authenticate) and
// serves the .well-known discovery metadata. Combined with
// CAMUNDA_AUTH_TYPE=passthrough the validated token is forwarded to the
// engine per call. Two createFrameworkApp calls because its oauth/no-oauth
// overloads are distinct (the oauth one types ctx.auth as non-nullable).
const { provider: oauth } = getOAuthConfigFromEnv()
if (!oauth) {
  // mcp-use 2 serves HTTP statelessly and issues no MCP session ids, so
  // without OAuth there is no caller identity: profile/settings saves —
  // including the default engine (`camunda7_engine` action "select") — refuse
  // per call (reads render defaults; a fronting gateway can restore session
  // scoping by stamping Mcp-Session-Id). One boot line beats N puzzling tool
  // errors.
  console.warn(
    "[miragon-ai] MCP_OAUTH is unset and mcp-use 2 issues no MCP session ids — user settings (incl. the default engine) cannot be saved (pass `engine` per call; set MCP_OAUTH for per-user settings).",
  )
}
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

// --- Tool-call logging -------------------------------------------------
// One log line per tools/call with tool name, duration, and outcome.
// Arguments and results are deliberately not logged — they can carry
// credentials or PII (e.g. process variables).
//
// mcp-use 2 delivers the tool name on `ctx.params.name` and fires this
// middleware once per call (batch entries individually) — the 1.x HTTP-layer
// name capture is gone with the problem it worked around.
app.use("mcp:tools/call", async (ctx, next) => {
  const toolName = (ctx.params as { name?: string } | undefined)?.name ?? "unknown"
  const start = Date.now()
  try {
    const result = await next()
    const isError =
      typeof result === "object" &&
      result !== null &&
      (result as { isError?: unknown }).isError === true
    console.log(
      `[miragon-ai] tools/call ${toolName} ${isError ? "error" : "ok"} in ${Date.now() - start}ms`,
    )
    return result
  } catch (error) {
    console.log(`[miragon-ai] tools/call ${toolName} error in ${Date.now() - start}ms`)
    throw error
  }
})

// `mcp-use dev` (the dev CLI since mcp-use 2) imports this entry, takes the
// default-exported server, and owns the socket + process lifecycle itself —
// it sets MCP_USE_DEV_CLI before loading the entry and rejects an entry
// without a default export. Self-serving below stays for production
// (`node dist/index.js`) and direct `node src/index.ts` runs.
if (process.env.MCP_USE_DEV_CLI) {
  // The dev CLI also unconditionally primes its own views manifest (built
  // from the optional `views/` directory — EMPTY in this repo, which bundles
  // views itself) onto the entry's export, and mcp-use rejects a second prime
  // after createFrameworkApp already primed the registry from `app.bundle`.
  // Swallow the CLI's empty prime — the bundle prime is the complete one.
  // Scoped to the dev CLI so a genuine double-prime still fails loudly.
  ;(app as unknown as { __primeViews: () => void }).__primeViews = () => {}
}

export default app

if (!process.env.MCP_USE_DEV_CLI) {
  // `||` (not `??`): an empty `PORT=` assignment from an env_file must fall back
  // to 8400 — `Number("")` is 0, which would bind a random OS-assigned port.
  const port = Number(process.env.PORT?.trim() || 8400)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[miragon-ai] invalid PORT "${process.env.PORT}" — expected an integer 1-65535`)
  }

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
