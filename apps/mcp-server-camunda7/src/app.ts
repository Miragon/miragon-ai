import { readFileSync } from "node:fs"
import path from "node:path"
import type { OAuthProvider } from "mcp-use/oauth"
import { createComposedServer, type ComposedServer } from "@miragon-ai/widget-shell/server"
import { getOAuthConfigFromEnv, oauthSecretEnvVarNames } from "./oauth.js"
import { initRuntime, type RuntimeBackends } from "./persistence/index.js"
import { composition, getPlugins } from "./setup.js"

const LABEL = "miragon-ai"

/** `src/` under tsx/vitest, `dist/` when compiled — the package root is one level up either way. */
const PACKAGE_ROOT = path.join(import.meta.dirname, "..")

/**
 * What the server advertises as `instructions` — deliberately short and
 * factual (the tool descriptions carry the details).
 */
export const SERVER_INSTRUCTIONS =
  "Camunda 7 / CIB Seven operations and Prometheus-backed process analytics. " +
  "Toolsets fail closed: a tool missing from tools/list is not enabled on this deployment. " +
  'With several engines, pass `engine` on each call (camunda7_engine action "list" names them). ' +
  "On hosts that render MCP Apps, prefer the *_show_* tools to present results to the user."

/** The version release-please maintains in `package.json` — never a hard-coded copy. */
export function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as {
    version: string
  }
  return pkg.version
}

/** Seams for the e2e suites; production passes none. */
export interface AppDeps {
  /**
   * The OAuth provider to install. Absent = built from `MCP_OAUTH`; present
   * (even `undefined`) = exactly this one — the e2e suites install a stub
   * provider so authenticated boots run the real bearer gate.
   */
  oauth?: OAuthProvider<unknown>
  /** Persistence backends; default: `initRuntime(env)` (Postgres / filesystem / memory). */
  runtime?: RuntimeBackends
  /** Widget bundle; default: the compiled `dist/mcp-app.{js,css}`. */
  bundle?: { jsPath: string; cssPath?: string }
}

/**
 * The composition root — the ONE boot sequence `src/index.ts` (production and
 * `mcp-use dev`) and the e2e suites share. App-owned here: the OAuth decision
 * (`MCP_OAUTH` → provider), persistence (`initRuntime`) and the plugins with
 * their cross-module wiring (`setup.ts`); the order of everything else lives
 * in the shared `createComposedServer` (`@miragon-ai/widget-shell/server`).
 */
export async function createApp(
  env: NodeJS.ProcessEnv = process.env,
  deps: AppDeps = {},
): Promise<ComposedServer> {
  // MCP_OAUTH turns the server into an OAuth resource server: mcp-use rejects
  // /mcp requests without a valid bearer token (401 + WWW-Authenticate) and
  // serves the .well-known discovery metadata. Whether a provider was BUILT
  // decides every module's default toolset (no suffix = the read-only floor
  // without OAuth, the standard toolset with it), and a bad MCP_OAUTH fails
  // the boot before migrations.
  const oauth = "oauth" in deps ? deps.oauth : getOAuthConfigFromEnv(env.MCP_OAUTH).provider
  if (!oauth) {
    // Without OAuth there is no caller identity: modules without an explicit
    // toolset run read-only, and — mcp-use 2 serves HTTP statelessly and
    // issues no MCP session ids — profile/settings saves (incl. the default
    // engine) refuse per call even under a wider explicit toolset.
    console.warn(
      `[${LABEL}] MCP_OAUTH is unset — modules without an explicit toolset run read-only, and user settings (incl. the default engine) cannot be saved. Set MCP_OAUTH, or widen with MCP_ACTIVE_MODULES=<module>:<toolset> (anyone who reaches this port gets that surface).`,
    )
  }

  return createComposedServer({
    label: LABEL,
    info: {
      name: "miragon-ai",
      version: packageVersion(),
      title: "Miragon AI",
      description: "Camunda 7 / CIB Seven operations and process analytics",
      websiteUrl: "https://github.com/Miragon/miragon-ai",
      instructions: SERVER_INSTRUCTIONS,
    },
    composition,
    env,
    oauth,
    // Secrets named inside MCP_OAUTH belong to the typo warner's allowlist.
    extraKnownEnvVars: oauthSecretEnvVarNames(env.MCP_OAUTH),
    bundle: deps.bundle ?? {
      jsPath: path.join(PACKAGE_ROOT, "dist", "mcp-app.js"),
      cssPath: path.join(PACKAGE_ROOT, "dist", "mcp-app.css"),
    },
    setup: async (boot) => {
      // Postgres when DATABASE_URL is set (migrations run here, before the
      // server listens — the healthcheck grace periods cover it), else
      // filesystem/in-memory.
      const runtime = deps.runtime ?? (await initRuntime(env))
      return {
        plugins: getPlugins(runtime.profileStore, boot),
        // Toolkit dashboards: only registered with the builder (OAuth and no
        // read-only module); undefined = its in-memory store.
        dashboardStore: runtime.dashboardStore,
        readiness: runtime.readiness,
        shutdown: () => runtime.shutdown(),
      }
    },
  })
}
