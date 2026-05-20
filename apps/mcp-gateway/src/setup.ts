import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import { z } from "zod"

import { createPlugin as createCamunda7Plugin } from "@miragon-ai/mcp-cibseven"
import { createPlugin as createAnalyticsPlugin } from "@miragon-ai/mcp-analytics"
import { createCamunda7Client, type Client as Camunda7Client } from "@miragon-ai/client-cibseven"

const camunda7ConfigSchema = z.object({
  baseUrl: z.string().default("http://localhost:8080/engine-rest"),
  cockpitUrl: z.string().url().optional(),
  authType: z.enum(["basic", "bearer", "none"]).default("none"),
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
  incidentIssueRepository: z
    .string()
    .regex(/^[^/\s]+\/[^/\s]+$/, "Expected `owner/repo`")
    .optional(),
})

const analyticsConfigSchema = z.object({
  url: z.string().default("http://localhost:8123"),
  username: z.string().default("default"),
  password: z.string().default(""),
  database: z.string().default("camunda_history"),
})

/**
 * Resources that are constructed once at server startup and shared across
 * multiple plugins. Letting one plugin reach into another's client (e.g. the
 * analytics plugin needing the Camunda7 client to fetch BPMN XML for the
 * path-frequency heatmap) keeps each plugin module independent while avoiding
 * duplicate client instances.
 */
interface SharedResources {
  camunda7Client?: Camunda7Client
}

/**
 * Registry of available module plugins. Each module defines how it loads its
 * config from environment variables, and how to construct its plugin.
 */
const MODULE_REGISTRY: Record<
  string,
  {
    createPlugin: (config: Record<string, unknown>, shared: SharedResources) => AppPlugin
    configFromEnv: () => Record<string, unknown>
  }
> = {
  camunda7: {
    createPlugin: (c) => createCamunda7Plugin(camunda7ConfigSchema.parse(c)),
    configFromEnv: () => ({
      baseUrl: process.env.CAMUNDA_BASE_URL,
      cockpitUrl: process.env.CAMUNDA_COCKPIT_URL,
      authType: process.env.CAMUNDA_AUTH_TYPE,
      username: process.env.CAMUNDA_USERNAME,
      password: process.env.CAMUNDA_PASSWORD,
      token: process.env.CAMUNDA_TOKEN,
      incidentIssueRepository: process.env.CAMUNDA_INCIDENT_ISSUE_REPO,
    }),
  },
  analytics: {
    createPlugin: (c, shared) =>
      createAnalyticsPlugin({
        ...analyticsConfigSchema.parse(c),
        camunda7Client: shared.camunda7Client,
      }),
    configFromEnv: () => ({
      url: process.env.CLICKHOUSE_URL,
      username: process.env.CLICKHOUSE_USERNAME,
      password: process.env.CLICKHOUSE_PASSWORD,
      database: process.env.CLICKHOUSE_DATABASE,
    }),
  },
}

/**
 * Determine which modules are active.
 *
 * MCP_ACTIVE_MODULES=camunda7,analytics  -> only these
 * MCP_ACTIVE_MODULES=all                 -> all available modules
 * not set                                -> all available modules (default)
 */
function getActiveModuleNames(): string[] {
  const envValue = process.env.MCP_ACTIVE_MODULES?.trim()

  if (!envValue || envValue === "all") {
    return Object.keys(MODULE_REGISTRY)
  }

  return envValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((name) => {
      if (!MODULE_REGISTRY[name]) {
        console.warn(`[automation-mcp] Unknown module "${name}" in MCP_ACTIVE_MODULES — skipping`)
        return false
      }
      return true
    })
}

function getActiveAppEntries(): AppConfigEntry[] {
  return getActiveModuleNames().map((name) => ({
    app: name,
    config: MODULE_REGISTRY[name].configFromEnv(),
  }))
}

/**
 * AppConfig used by `get-framework-manifest` so the manifest reflects the
 * per-module config blobs derived from env. Plugin registry construction +
 * per-plugin tool registration are owned by `createFrameworkApp`.
 */
export function getAppConfig(): AppConfig {
  return {
    activeApps: getActiveAppEntries(),
    pipelines: {},
  }
}

function buildSharedResources(entries: AppConfigEntry[]): SharedResources {
  // Build a single Camunda7 client when the camunda7 module is active, so
  // other modules (analytics) can call the engine without each one wiring
  // its own auth.
  const camunda7Entry = entries.find((e) => e.app === "camunda7")
  if (!camunda7Entry) return {}
  const parsed = camunda7ConfigSchema.parse(camunda7Entry.config)
  const camunda7Client = createCamunda7Client({
    baseUrl: parsed.baseUrl,
    authType: parsed.authType,
    username: parsed.username,
    password: parsed.password,
    token: parsed.token,
  })
  return { camunda7Client }
}

export function getPlugins(): AppPlugin[] {
  const entries = getActiveAppEntries()
  const shared = buildSharedResources(entries)
  return entries
    .filter((entry) => MODULE_REGISTRY[entry.app])
    .map((entry) => MODULE_REGISTRY[entry.app].createPlugin(entry.config, shared))
}
