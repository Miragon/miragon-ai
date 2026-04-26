import fs from "node:fs"
import path from "node:path"

import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import { z } from "zod"

import { createPlugin as createCamunda7Plugin } from "@miragon-ai/mcp-cibseven"
import { createPlugin as createAnalyticsPlugin } from "@miragon-ai/mcp-analytics"
import { createPlugin as createEnrichmentPlugin } from "@miragon-ai/mcp-enrichment"
import { parseEnrichmentConfig } from "@miragon-ai/client-enrichment"

const camunda7ConfigSchema = z.object({
  baseUrl: z.string().default("http://localhost:8080/engine-rest"),
  cockpitUrl: z.string().url().optional(),
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

const enrichmentConfigSchema = z.object({
  /** Absolute or cwd-relative path to a tenant enrichment YAML. */
  configPath: z.string(),
  /** Set `"none"` to downgrade missing secrets to a 401-at-call-time instead of booting. */
  onMissingSecret: z.enum(["throw", "none"]).optional().default("throw"),
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
      cockpitUrl: process.env.CAMUNDA_COCKPIT_URL,
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
  enrichment: {
    createPlugin: (c) => {
      const parsed = enrichmentConfigSchema.parse(c)
      const absPath = path.isAbsolute(parsed.configPath)
        ? parsed.configPath
        : path.resolve(process.cwd(), parsed.configPath)
      if (!fs.existsSync(absPath)) {
        throw new Error(
          `ENRICHMENT_CONFIG_PATH points to a file that does not exist: ${absPath}\n` +
            `Update your .env — available examples in server/resources/enrichment-examples/`,
        )
      }
      const yaml = fs.readFileSync(absPath, "utf-8")
      return createEnrichmentPlugin({
        config: parseEnrichmentConfig(yaml),
        onMissingSecret: parsed.onMissingSecret,
      })
    },
    configFromEnv: () => ({
      configPath: process.env.ENRICHMENT_CONFIG_PATH,
      onMissingSecret: process.env.ENRICHMENT_ON_MISSING_SECRET,
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
/** Modules that should only auto-activate in the "all"/default mode when
 * their required env configuration is present. */
const OPT_IN_MODULES: Record<string, () => boolean> = {
  enrichment: () => Boolean(process.env.ENRICHMENT_CONFIG_PATH),
}

function getActiveModuleNames(): string[] {
  const envValue = process.env.MCP_ACTIVE_MODULES?.trim()

  if (!envValue || envValue === "all") {
    return Object.keys(MODULE_REGISTRY).filter((name) => OPT_IN_MODULES[name]?.() !== false)
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

export function getPlugins(): AppPlugin[] {
  return getActiveAppEntries()
    .filter((entry) => MODULE_REGISTRY[entry.app])
    .map((entry) => MODULE_REGISTRY[entry.app].createPlugin(entry.config))
}
