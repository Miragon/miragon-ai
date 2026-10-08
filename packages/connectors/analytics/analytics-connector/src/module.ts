import { z } from "zod"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"
import { createPlugin } from "./plugin.js"
import { analyticsToolsets } from "./toolsets.js"
import type { FetchBpmnXml } from "./widget-tools.js"
import type { ProfileSource } from "./server-locale.js"

/**
 * Self-contained module definition for host apps: everything the app needs to
 * mount the analytics module without knowing its config surface. Conforms
 * structurally to the app's `ModuleDefinition` port — no import of the app.
 */

const analyticsConfigSchema = z.object({
  url: z.string().default("http://localhost:9090"),
  /**
   * The effective toolset the composition root resolved from the
   * `MCP_ACTIVE_MODULES` suffix — always a concrete declared name there. The
   * module's tools are read-only by nature; the toolset only gates the one
   * durable write, `analytics_save_settings` (`standard` only). Kept a plain
   * string here so a direct caller's unknown name still fails closed (warning
   * + `read-only`) instead of throwing — `createPlugin` below resolves it.
   */
  toolset: z.string().optional(),
})

/** Cross-module resources the host app threads in (structural, app-owned). */
interface AnalyticsModuleShared {
  profileStore?: ProfileSource
  fetchBpmnXml?: FetchBpmnXml
}

export const analyticsModule = {
  name: "analytics",

  /**
   * Pure env → raw-config mapping. `PROMETHEUS_URL` is trimmed so an empty
   * assignment (`PROMETHEUS_URL=` left in a .env or compose env_file) falls
   * through to the schema default instead of producing an invalid-URL client.
   */
  configFromEnv(env: NodeJS.ProcessEnv): Record<string, unknown> {
    return { url: env.PROMETHEUS_URL?.trim() || undefined }
  },

  /** This module's slice of the app's unknown-env-var typo warner. */
  knownEnvVars: ["PROMETHEUS_URL"] as const,

  /**
   * `read-only` (the floor) | `standard` (adds the caller's own settings save,
   * `analytics_save_settings`; everything else is read-only anyway). No suffix
   * means `read-only` without OAuth and `standard` with it; an empty or unknown
   * suffix falls back to `read-only`. See `toolsets.ts`.
   */
  toolsets: analyticsToolsets,

  /**
   * Boot-time hints for active deployments. The code default (:9090) matches a
   * bare Prometheus, NOT the repo's compose stack (:8460) — without the hint
   * every analytics query 404s silently.
   */
  bootWarnings(env: NodeJS.ProcessEnv): string[] {
    if (env.PROMETHEUS_URL?.trim()) return []
    return [
      "PROMETHEUS_URL is not set — defaulting to http://localhost:9090. The repo's Compose stack publishes Prometheus on :8460 (PROMETHEUS_URL=http://localhost:8460).",
    ]
  },

  createPlugin(
    config: Record<string, unknown>,
    shared: AnalyticsModuleShared,
  ): AppPlugin<MCPServer> {
    const { toolset, ...parsed } = analyticsConfigSchema.parse(config)
    return createPlugin({
      ...parsed,
      // Resolved once, here: missing → the read-only floor, unknown → warning +
      // floor. The plugin only ever sees a declared name.
      toolset: analyticsToolsets.resolve(toolset),
      fetchBpmnXml: shared.fetchBpmnXml,
      profileStore: shared.profileStore,
    })
  },
}
