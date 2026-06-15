import fs from "node:fs"
import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import { z } from "zod"

import { createPlugin as createCamunda7Plugin } from "@miragon-ai/mcp-cibseven"
import { createPlugin as createAnalyticsPlugin } from "@miragon-ai/mcp-analytics"
import { createCamunda7Client, type Client as Camunda7Client } from "@miragon-ai/client-cibseven"

const engineSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      "Engine id must be lowercase alphanumeric / dashes, starting with a letter or digit",
    ),
  baseUrl: z.string().url(),
  cockpitUrl: z.string().url().optional(),
})

const camunda7ConfigSchema = z.object({
  engines: z.array(engineSchema).min(1),
  authType: z.enum(["basic", "bearer", "none"]).default("none"),
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
  toolset: z.string().optional(),
  incidentIssueRepository: z
    .string()
    .regex(/^[^/\s]+\/[^/\s]+$/, "Expected `owner/repo`")
    .optional(),
  healthThresholds: z
    .object({
      criticalIncidents: z.coerce.number().int().positive().optional(),
      criticalClusterSize: z.coerce.number().int().positive().optional(),
    })
    .optional(),
})

const analyticsConfigSchema = z.object({
  url: z.string().default("http://localhost:9090"),
})

interface SharedResources {
  camunda7Client?: Camunda7Client
}

const MODULE_REGISTRY: Record<
  string,
  {
    createPlugin: (config: Record<string, unknown>, shared: SharedResources) => AppPlugin<MCPServer>
    configFromEnv: () => Record<string, unknown>
    /** Whether the module understands the `module:toolset` suffix syntax. */
    supportsToolsets: boolean
  }
> = {
  camunda7: {
    createPlugin: (c) => createCamunda7Plugin(camunda7ConfigSchema.parse(c)),
    configFromEnv: () => ({
      engines: loadEnginesFromEnv(),
      authType: process.env.CAMUNDA_AUTH_TYPE,
      username: process.env.CAMUNDA_USERNAME,
      password: process.env.CAMUNDA_PASSWORD,
      token: process.env.CAMUNDA_TOKEN,
      incidentIssueRepository: process.env.CAMUNDA_INCIDENT_ISSUE_REPO,
      // Engine-health verdict thresholds — only forwarded when set, so the
      // module's defaults apply otherwise.
      ...(process.env.CAMUNDA_HEALTH_CRITICAL_INCIDENTS ||
      process.env.CAMUNDA_HEALTH_CRITICAL_CLUSTER_SIZE
        ? {
            healthThresholds: {
              criticalIncidents: process.env.CAMUNDA_HEALTH_CRITICAL_INCIDENTS,
              criticalClusterSize: process.env.CAMUNDA_HEALTH_CRITICAL_CLUSTER_SIZE,
            },
          }
        : {}),
    }),
    supportsToolsets: true,
  },
  analytics: {
    createPlugin: (c, shared) =>
      createAnalyticsPlugin({
        ...analyticsConfigSchema.parse(c),
        camunda7Client: shared.camunda7Client,
      }),
    configFromEnv: () => ({
      url: process.env.PROMETHEUS_URL,
    }),
    supportsToolsets: false,
  },
}

/**
 * Resolves the engine list from environment in this order of precedence:
 *   1. `CAMUNDA_ENGINES_FILE` — path to a JSON array (preferred at scale; fits ConfigMap workflows).
 *   2. `CAMUNDA_ENGINES_JSON` — inline JSON array.
 *   3. `CAMUNDA_BASE_URL` (+ `CAMUNDA_COCKPIT_URL`) — backward-compat single-engine,
 *      synthesized as `id: "default"`.
 *
 * Returns `undefined` when nothing is set, leaving the Zod default (`http://localhost:8410/engine-rest`).
 */
function loadEnginesFromEnv(): unknown {
  const filePath = process.env.CAMUNDA_ENGINES_FILE?.trim()
  if (filePath) {
    const raw = fs.readFileSync(filePath, "utf8")
    return JSON.parse(raw)
  }
  const json = process.env.CAMUNDA_ENGINES_JSON?.trim()
  if (json) {
    return JSON.parse(json)
  }
  const legacyBaseUrl = process.env.CAMUNDA_BASE_URL?.trim()
  if (legacyBaseUrl) {
    return [
      {
        id: "default",
        baseUrl: legacyBaseUrl,
        ...(process.env.CAMUNDA_COCKPIT_URL ? { cockpitUrl: process.env.CAMUNDA_COCKPIT_URL } : {}),
      },
    ]
  }
  return [{ id: "default", baseUrl: "http://localhost:8410/engine-rest" }]
}

interface ActiveModule {
  name: string
  /**
   * Optional toolset suffix from the `module:toolset` syntax, e.g.
   * `camunda7:read-only`. Validated by the module itself (the camunda7 plugin
   * warns + exposes all tools for unknown toolsets — fail-open, consistent
   * with the unknown-module handling here).
   */
  toolset?: string
}

function getActiveModules(): ActiveModule[] {
  const envValue = process.env.MCP_ACTIVE_MODULES?.trim()

  if (!envValue || envValue === "all") {
    return Object.keys(MODULE_REGISTRY).map((name) => ({ name }))
  }

  return envValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry): ActiveModule => {
      const [name, toolset] = entry.split(":", 2)
      return toolset ? { name, toolset } : { name }
    })
    .filter(({ name }) => {
      if (!MODULE_REGISTRY[name]) {
        console.warn(`[automation-mcp] Unknown module "${name}" in MCP_ACTIVE_MODULES — skipping`)
        return false
      }
      return true
    })
}

function getActiveAppEntries(): AppConfigEntry[] {
  return getActiveModules().map(({ name, toolset }) => {
    if (toolset && !MODULE_REGISTRY[name].supportsToolsets) {
      console.warn(
        `[automation-mcp] Module "${name}" has no toolsets — ignoring ":${toolset}" and exposing all tools`,
      )
      toolset = undefined
    }
    return {
      app: name,
      config: {
        ...MODULE_REGISTRY[name].configFromEnv(),
        ...(toolset ? { toolset } : {}),
      },
    }
  })
}

export function getAppConfig(): AppConfig {
  return {
    activeApps: getActiveAppEntries(),
    pipelines: {},
  }
}

function buildSharedResources(entries: AppConfigEntry[]): SharedResources {
  // Build a single Camunda7 client (against the first engine) for modules that
  // need to reach the engine REST API but don't yet participate in the
  // multi-engine routing — most notably the analytics module's BPMN-XML fetch
  // for the path-frequency heatmap. When a process definition exists on more
  // than one engine the XML is assumed to match across engines.
  const camunda7Entry = entries.find((e) => e.app === "camunda7")
  if (!camunda7Entry) return {}
  const parsed = camunda7ConfigSchema.parse(camunda7Entry.config)
  const primary = parsed.engines[0]
  const camunda7Client = createCamunda7Client({
    baseUrl: primary.baseUrl,
    authType: parsed.authType,
    username: parsed.username,
    password: parsed.password,
    token: parsed.token,
  })
  return { camunda7Client }
}

export function getPlugins(): AppPlugin<MCPServer>[] {
  const entries = getActiveAppEntries()
  const shared = buildSharedResources(entries)
  return entries
    .filter((entry) => MODULE_REGISTRY[entry.app])
    .map((entry) => MODULE_REGISTRY[entry.app].createPlugin(entry.config, shared))
}
