import type { MCPServer } from "mcp-use/server"
import type { ModulePlugin } from "@automation-mcp/core"
import { z } from "zod"

import { createPlugin as createCamunda7Plugin } from "@automation-mcp/mcp-camunda7"
import { createPlugin as createAnalyticsPlugin } from "@automation-mcp/mcp-analytics"

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
    createPlugin: (config: Record<string, unknown>) => ModulePlugin
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
        console.warn(
          `[automation-mcp] Unknown module "${name}" in MCP_ACTIVE_MODULES — skipping`,
        )
        return false
      }
      return true
    })
}

export function createPlugins(): ModulePlugin[] {
  return getActiveModuleNames().map((name) => {
    const entry = MODULE_REGISTRY[name]
    return entry.createPlugin(entry.configFromEnv())
  })
}

export function registerModuleTools(server: MCPServer, plugins: ModulePlugin[]) {
  for (const plugin of plugins) {
    plugin.registerTools?.(server)
  }
}

export function registerWidgetTools(
  server: MCPServer,
  resourceUri: string,
  plugins: ModulePlugin[],
) {
  for (const plugin of plugins) {
    plugin.registerWidgetTools?.(server, resourceUri)
  }
}
