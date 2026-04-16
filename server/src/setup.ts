import type { MCPServer } from "mcp-use/server"
import {
  StepRegistry,
  WidgetRegistry,
  loadApps,
  type AppConfig,
  type AppConfigEntry,
  type AppPlugin,
} from "@miragon/mcp-toolkit-core"
import { z } from "zod"

import { createPlugin as createCamunda7Plugin } from "@miragon-ai/mcp-camunda7"
import { createPlugin as createAnalyticsPlugin } from "@miragon-ai/mcp-analytics"

const camunda7ConfigSchema = z.object({
  baseUrl: z.string().default("http://localhost:8080/engine-rest"),
  authType: z.enum(["basic", "bearer", "none"]).default("none"),
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
})

const analyticsConfigSchema = z.object({
  url: z.string().default("http://localhost:8123"),
  username: z.string().default("default"),
  password: z.string().default(""),
  database: z.string().default("camunda_history"),
})

/**
 * Registry of available module plugins. Each module defines how it loads its
 * config from environment variables, and how to construct its plugin.
 */
const MODULE_REGISTRY: Record<
  string,
  {
    createPlugin: (config: Record<string, unknown>) => AppPlugin
    configFromEnv: () => Record<string, unknown>
  }
> = {
  camunda7: {
    createPlugin: (c) => createCamunda7Plugin(camunda7ConfigSchema.parse(c)),
    configFromEnv: () => ({
      baseUrl: process.env.CAMUNDA_BASE_URL,
      authType: process.env.CAMUNDA_AUTH_TYPE,
      username: process.env.CAMUNDA_USERNAME,
      password: process.env.CAMUNDA_PASSWORD,
      token: process.env.CAMUNDA_TOKEN,
    }),
  },
  analytics: {
    createPlugin: (c) => createAnalyticsPlugin(analyticsConfigSchema.parse(c)),
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

export const config: AppConfig = {
  activeApps: getActiveAppEntries(),
  pipelines: {},
}

function createPlugins(): AppPlugin[] {
  return config.activeApps
    .filter((entry) => MODULE_REGISTRY[entry.app])
    .map((entry) => MODULE_REGISTRY[entry.app].createPlugin(entry.config))
}

/**
 * Creates the framework registries and loads every active app's steps and
 * widgets into them. Also collects per-app `appConfig` values so pipeline
 * steps can access their module client via `executePipeline(..., appConfigs)`.
 */
export function createRegistries() {
  const plugins = createPlugins()
  const stepRegistry = new StepRegistry()
  const widgetRegistry = new WidgetRegistry()
  loadApps(
    plugins.map((p) => p.definition),
    stepRegistry,
    widgetRegistry,
  )

  const appConfigs: Record<string, Record<string, unknown>> = {}
  for (const plugin of plugins) {
    if (plugin.appConfig) {
      appConfigs[plugin.definition.name] = plugin.appConfig
    }
  }

  return { stepRegistry, widgetRegistry, config, plugins, appConfigs }
}

export function registerModuleTools(server: MCPServer, plugins: AppPlugin[]) {
  for (const plugin of plugins) {
    plugin.registerTools?.(server)
  }
}

export function registerWidgetTools(server: MCPServer, resourceUri: string, plugins: AppPlugin[]) {
  for (const plugin of plugins) {
    plugin.registerWidgetTools?.(server, resourceUri)
  }
}
