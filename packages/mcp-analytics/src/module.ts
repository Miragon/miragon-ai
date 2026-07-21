import { z } from "zod"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import { createPlugin } from "./plugin.js"
import type { FetchBpmnXml } from "./widget-tools.js"
import type { LocaleSource } from "./server-locale.js"

/**
 * Self-contained module definition for host apps: everything the app needs to
 * mount the analytics module without knowing its config surface. Conforms
 * structurally to the app's `ModuleDefinition` port — no import of the app.
 */

const analyticsConfigSchema = z.object({
  url: z.string().default("http://localhost:9090"),
})

/** Cross-module resources the host app threads in (structural, app-owned). */
interface AnalyticsModuleShared {
  profileStore?: LocaleSource
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

  supportsToolsets: false,

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
    return createPlugin({
      ...analyticsConfigSchema.parse(config),
      fetchBpmnXml: shared.fetchBpmnXml,
      profileStore: shared.profileStore,
    })
  },
}
