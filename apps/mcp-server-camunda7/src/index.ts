#!/usr/bin/env node

import path from "node:path"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import {
  createFileSystemDashboardStore,
  createFrameworkApp,
  installToolCallNameCapture,
} from "@miragon/mcp-toolkit-core/tools"
import { emitBootWarnings, getAppConfig, getPlugins, warnUnknownEnvVars } from "./setup.js"
import {
  getOAuthConfigFromEnv,
  installAuthorizeRedirectAllowlist,
  oauthSecretEnvVarNames,
} from "./oauth.js"

// mcp-use ships anonymized telemetry (PostHog + Scarf) enabled by default —
// an ops server must not phone home unless explicitly opted in.
process.env.MCP_USE_ANONYMIZED_TELEMETRY ??= "false"

// Surface CAMUNDA_*/MCP_* typos at boot instead of silently ignoring them —
// secrets named inside MCP_OAUTH belong to the allowlist.
warnUnknownEnvVars(process.env, oauthSecretEnvVarNames())
emitBootWarnings()

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname

const HTML_PATH = path.join(DIST_DIR, "mcp-app.html")

const frameworkOptions = {
  name: "miragon-ai",
  version: "0.1.0",
  host: "0.0.0.0",
  baseUrl: process.env.MCP_URL,
  // Cast: toolkit's `plugins: AppPlugin[]` is unparameterized (TServer = unknown),
  // but our plugin factories return `AppPlugin<MCPServer>`. The framework invokes
  // `registerTools(MCPServer)` at runtime, so the narrowing is sound.
  plugins: getPlugins() as AppPlugin[],
  appConfig: getAppConfig(),
  app: {
    // resourceUri omitted: createFrameworkApp content-hashes htmlPath into a
    // cache-busting ui://miragon-ai/mcp-app.<hash>.html (with a stable dev
    // fallback when the bundle isn't built yet) — the same derivation this file
    // used to do by hand. Pass an explicit resourceUri only to pin it.
    htmlPath: HTML_PATH,
    // Toolkit 0.4.0 made the visual builder + dashboard-persistence tools
    // (get-builder-catalogue, save/load/list/delete-dashboard) opt-in, defaulting
    // off. We keep them on to preserve the server's tool surface.
    builder: true,
    // Persist saved dashboards to disk when MCP_DASHBOARD_DIR is set so they
    // survive restarts; otherwise the toolkit's default in-memory store is used
    // (fine for dev, lost on restart).
    dashboardStore: process.env.MCP_DASHBOARD_DIR
      ? createFileSystemDashboardStore({ dir: process.env.MCP_DASHBOARD_DIR })
      : undefined,
  },
}

// MCP_OAUTH turns the server into an OAuth resource server: mcp-use rejects
// /mcp requests without a valid bearer token (401 + WWW-Authenticate) and
// serves the .well-known discovery metadata. Combined with
// CAMUNDA_AUTH_TYPE=passthrough the validated token is forwarded to the
// engine per call. Two createFrameworkApp calls because its oauth/no-oauth
// overloads are distinct (the oauth one types ctx.auth as non-nullable).
const { provider: oauth, redirectAllowlist } = getOAuthConfigFromEnv()
const app = oauth
  ? await createFrameworkApp({ ...frameworkOptions, oauth })
  : await createFrameworkApp(frameworkOptions)

// oidc-proxy mounts proxy /authorize+/callback+/token; enforce the redirect
// allowlist before mcp-use handles /authorize (see installAuthorizeRedirectAllowlist).
if (redirectAllowlist) {
  installAuthorizeRedirectAllowlist(app, redirectAllowlist)
}

// --- Tool-call logging -------------------------------------------------
// One log line per tools/call with tool name, duration, and outcome.
// Arguments and results are deliberately not logged — they can carry
// credentials or PII (e.g. process variables).
//
// mcp-use passes only the tool *arguments* as `ctx.params` to `mcp:tools/call`
// middleware, so `params.name` is never populated at runtime. The toolkit's
// `installToolCallNameCapture` recovers the real name from the JSON-RPC envelope
// at the HTTP layer and exposes it via a request-scoped resolver.
const resolveToolName = installToolCallNameCapture(app)

app.use("mcp:tools/call", async (_ctx, next) => {
  const toolName = resolveToolName() ?? "unknown"
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

// `||` (not `??`): an empty `PORT=` assignment from an env_file must fall back
// to 8400 — `Number("")` is 0, which would bind a random OS-assigned port.
const port = Number(process.env.PORT?.trim() || 8400)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`[miragon-ai] invalid PORT "${process.env.PORT}" — expected an integer 1-65535`)
}
await app.listen(port)
