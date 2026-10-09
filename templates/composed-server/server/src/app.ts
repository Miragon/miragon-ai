import { readFileSync } from "node:fs"
import path from "node:path"
import { createComposedServer, type ComposedServer } from "@miragon-ai/widget-shell/server"
import {
  composition,
  createDashboardStore,
  createProfileStore,
  getPlugins,
  startSessionCleanup,
} from "./setup.js"

/** `src/` under tsx/vitest, `dist/` when compiled — the package root is one level up either way. */
const PACKAGE_ROOT = path.join(import.meta.dirname, "..")

/** What the server advertises as `instructions`: short and factual — tool descriptions carry the rest. */
export const SERVER_INSTRUCTIONS =
  "Camunda 7 / CIB Seven operations, process analytics and team notes. " +
  "Toolsets fail closed: a tool missing from tools/list is not enabled on this deployment. " +
  "With several engines, pass `engine` on each call. " +
  "On hosts that render MCP Apps, prefer the *_show_* tools to present results to the user."

/** The version in `package.json` — reported as `serverInfo.version`, never a hard-coded copy. */
export function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as {
    version: string
  }
  return pkg.version
}

export interface AppDeps {
  /** Widget bundle; default: the compiled `dist/mcp-app.{js,css}` (tests pass a stand-in). */
  bundle?: { jsPath: string; cssPath?: string }
}

/**
 * The composition root `src/index.ts` and the tests share. The boot ORDER —
 * selection and boot log, the mcp-use server, request context, tool-call
 * logging, `/metrics`, the Host/Origin guard, `/health/*`, the body-capped
 * listener and the graceful drain — lives in `createComposedServer`
 * (`@miragon-ai/widget-shell/server`); this file only wires what is yours:
 * persistence and the plugins (`setup.ts`).
 */
export async function createApp(
  env: NodeJS.ProcessEnv = process.env,
  deps: AppDeps = {},
): Promise<ComposedServer> {
  return createComposedServer({
    label: "acme-mcp",
    info: {
      name: "acme-mcp",
      version: packageVersion(),
      title: "Acme MCP",
      instructions: SERVER_INSTRUCTIONS,
    },
    composition,
    env,
    bundle: deps.bundle ?? {
      // Read ONCE at boot — after rebuilding the bundle, restart the server.
      jsPath: path.join(PACKAGE_ROOT, "dist", "mcp-app.js"),
      cssPath: path.join(PACKAGE_ROOT, "dist", "mcp-app.css"),
    },
    setup: (boot) => {
      const profileStore = createProfileStore(env)
      const stopCleanup = startSessionCleanup(profileStore, env)
      return {
        plugins: getPlugins(profileStore, boot),
        dashboardStore: createDashboardStore(env),
        // Readiness covers the stores YOU wire (a `SELECT 1` round trip for a
        // database) — never upstreams like the engine or Prometheus.
        readiness: {},
        shutdown: async () => stopCleanup(),
      }
    },
  })
}
