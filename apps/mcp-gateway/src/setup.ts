import fs from "node:fs"
import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import { z } from "zod"

import {
  createPlugin as createCamunda7Plugin,
  createFileSystemProfileStore,
  createInMemoryProfileStore,
  resolveMcpBearerToken,
  type ProfileStore,
} from "@miragon-ai/mcp-cibseven"
import { createPlugin as createAnalyticsPlugin } from "@miragon-ai/mcp-analytics"
import { createCamunda7Client, type Client as Camunda7Client } from "@miragon-ai/client-cibseven"

// Incomplete credentials must fail the boot, not silently degrade to
// unauthenticated engine requests — a typo'd CAMUNDA_USERNAME would otherwise
// only surface as engine 401s (or go unnoticed against an auth-less engine).
const engineAuthSchema = z
  .object({
    type: z.enum(["basic", "bearer", "passthrough", "none"]),
    username: z.string().optional(),
    password: z.string().optional(),
    token: z.string().optional(),
  })
  .refine((a) => a.type !== "basic" || Boolean(a.username && a.password), {
    message: 'engine auth type "basic" requires username and password',
  })
  .refine((a) => a.type !== "bearer" || Boolean(a.token), {
    message: 'engine auth type "bearer" requires token',
  })

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
  /** Per-engine override; engines without one use the global CAMUNDA_* auth. */
  auth: engineAuthSchema.optional(),
})

const camunda7ConfigSchema = z
  .object({
    engines: z.array(engineSchema).min(1),
    authType: z.enum(["basic", "bearer", "passthrough", "none"]).default("none"),
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
  // The global credentials are only the fallback for engines without their
  // own `auth` — when every engine carries one, don't demand them.
  .refine(
    (c) =>
      c.authType !== "basic" || c.engines.every((e) => e.auth) || Boolean(c.username && c.password),
    {
      message:
        "CAMUNDA_AUTH_TYPE=basic requires CAMUNDA_USERNAME and CAMUNDA_PASSWORD (unless every engine carries its own auth) — otherwise engine requests would silently run unauthenticated",
    },
  )
  .refine((c) => c.authType !== "bearer" || c.engines.every((e) => e.auth) || Boolean(c.token), {
    message:
      "CAMUNDA_AUTH_TYPE=bearer requires CAMUNDA_TOKEN (unless every engine carries its own auth) — otherwise engine requests would silently run unauthenticated",
  })

const analyticsConfigSchema = z.object({
  url: z.string().default("http://localhost:9090"),
})

interface SharedResources {
  camunda7Client?: Camunda7Client
  /**
   * Per-session/user preference store, shared across modules so engine
   * availability, locale, theme, dashboard and analytics defaults come from one
   * source. Filesystem-backed when `MCP_PROFILE_DIR` is set (survives restarts),
   * else in-memory (lost on restart, like the sticky engine selection).
   */
  profileStore: ProfileStore
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
    createPlugin: (c, shared) =>
      createCamunda7Plugin(camunda7ConfigSchema.parse(c), {
        profileStore: shared.profileStore,
      }),
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
        profileStore: shared.profileStore,
      }),
    configFromEnv: () => ({
      // Trimmed so an empty assignment (`PROMETHEUS_URL=` left in a .env or
      // compose env_file) falls through to the schema default instead of
      // producing an invalid-URL Prometheus client.
      url: process.env.PROMETHEUS_URL?.trim() || undefined,
    }),
    supportsToolsets: false,
  },
}

/**
 * Boot-time hint, deliberately separate from `configFromEnv` (which runs
 * twice per boot — getPlugins + getAppConfig — and stays side-effect free).
 * The code default (:9090) matches a bare Prometheus, NOT the repo's compose
 * stack (:8460) — without the hint every analytics query 404s silently.
 */
export function warnPrometheusDefault(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.PROMETHEUS_URL?.trim()) return false
  const modules = env.MCP_ACTIVE_MODULES?.trim()
  const analyticsActive =
    !modules ||
    modules === "all" ||
    modules.split(",").some((entry) => entry.trim().split(":")[0] === "analytics")
  if (!analyticsActive) return false
  console.warn(
    "[miragon-ai] PROMETHEUS_URL is not set — defaulting to http://localhost:9090. The repo's Compose stack publishes Prometheus on :8460 (PROMETHEUS_URL=http://localhost:8460).",
  )
  return true
}

/**
 * All CAMUNDA_- and MCP-prefixed variables the gateway (or its docs) define. Foreign
 * prefixes owned by dependencies are exempt: `MCP_USE_*` (mcp-use itself),
 * `MCP_PROXY_*` (proxy secrets named inside MCP_PROXIES entries),
 * `MCP_INSPECTOR_*` (the dev inspector).
 */
const KNOWN_ENV_VARS = new Set([
  "MCP_URL",
  "MCP_OAUTH",
  "MCP_ACTIVE_MODULES",
  "MCP_PROXIES",
  "MCP_DASHBOARD_DIR",
  "MCP_PROFILE_DIR",
  "CAMUNDA_ENGINES_FILE",
  "CAMUNDA_ENGINES_JSON",
  "CAMUNDA_BASE_URL",
  "CAMUNDA_COCKPIT_URL",
  "CAMUNDA_AUTH_TYPE",
  "CAMUNDA_USERNAME",
  "CAMUNDA_PASSWORD",
  "CAMUNDA_TOKEN",
  "CAMUNDA_INCIDENT_ISSUE_REPO",
  "CAMUNDA_HEALTH_CRITICAL_INCIDENTS",
  "CAMUNDA_HEALTH_CRITICAL_CLUSTER_SIZE",
  // mcp-use's own logger knob, consumed in-process (unprefixed, unlike the
  // rest of its MCP_USE_* family).
  "MCP_DEBUG_LEVEL",
])

const FOREIGN_ENV_PREFIXES = ["MCP_USE_", "MCP_PROXY_", "MCP_INSPECTOR_"]

/**
 * Reports unknown CAMUNDA_- and MCP-prefixed variables at boot so a typo
 * (CAMUNDA_ENGINE_JSON, MCP_DASHBOARDS_DIR) doesn't get silently ignored.
 * Warns instead of throwing: an unknown variable can't misconfigure anything
 * by itself.
 */
export function warnUnknownEnvVars(
  env: NodeJS.ProcessEnv = process.env,
  extraKnown: Iterable<string> = [],
): string[] {
  const known = new Set([...KNOWN_ENV_VARS, ...extraKnown])
  const unknown = Object.keys(env).filter(
    (name) =>
      (name.startsWith("CAMUNDA_") || name.startsWith("MCP_")) &&
      !known.has(name) &&
      !FOREIGN_ENV_PREFIXES.some((prefix) => name.startsWith(prefix)),
  )
  for (const name of unknown) {
    console.warn(
      `[miragon-ai] Unknown environment variable "${name}" — the gateway does not read it; check for a typo (see docs/operations.md).`,
    )
  }
  return unknown
}

/**
 * Env-var names referenced inside `MCP_PROXIES` entries — the auth modes name
 * their secrets via `…EnvVar` fields, and the toolkit's proxy layer reads
 * them from the environment. [[warnUnknownEnvVars]] must not report them.
 */
export function proxySecretEnvVarNames(proxies: readonly unknown[]): string[] {
  return proxies.flatMap((proxy) => {
    const auth = (proxy as { auth?: Record<string, unknown> }).auth
    if (!auth) return []
    return Object.entries(auth)
      .filter(([key, value]) => key.endsWith("EnvVar") && typeof value === "string")
      .map(([, value]) => value as string)
  })
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
        console.warn(`[miragon-ai] Unknown module "${name}" in MCP_ACTIVE_MODULES — skipping`)
        return false
      }
      return true
    })
}

function getActiveAppEntries(): AppConfigEntry[] {
  return getActiveModules().map(({ name, toolset }) => {
    if (toolset && !MODULE_REGISTRY[name].supportsToolsets) {
      console.warn(
        `[miragon-ai] Module "${name}" has no toolsets — ignoring ":${toolset}" and exposing all tools`,
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
  // One preference store for the whole gateway, regardless of which modules are
  // active. Filesystem-backed when MCP_PROFILE_DIR is set so profiles survive
  // restarts; otherwise in-memory (fine for dev, lost on restart).
  const profileStore: ProfileStore = process.env.MCP_PROFILE_DIR
    ? createFileSystemProfileStore({ dir: process.env.MCP_PROFILE_DIR })
    : createInMemoryProfileStore()

  // Build a single Camunda7 client (against the first engine) for modules that
  // need to reach the engine REST API but don't yet participate in the
  // multi-engine routing — most notably the analytics module's BPMN-XML fetch
  // for the path-frequency heatmap. When a process definition exists on more
  // than one engine the XML is assumed to match across engines.
  const camunda7Entry = entries.find((e) => e.app === "camunda7")
  if (!camunda7Entry) return { profileStore }
  const parsed = camunda7ConfigSchema.parse(camunda7Entry.config)
  const primary = parsed.engines[0]
  // Per-engine auth wins wholesale over the global CAMUNDA_* fallback —
  // mirroring the registry clients in the camunda7 plugin.
  const auth = primary.auth ?? {
    type: parsed.authType,
    username: parsed.username,
    password: parsed.password,
    token: parsed.token,
  }
  const camunda7Client = createCamunda7Client({
    baseUrl: primary.baseUrl,
    authType: auth.type,
    username: auth.username,
    password: auth.password,
    token: auth.token,
    // Same passthrough semantics as the per-engine registry clients —
    // without it the analytics BPMN-XML fetch would silently 401 and the
    // heatmap would lose its diagram.
    tokenProvider: auth.type === "passthrough" ? resolveMcpBearerToken : undefined,
  })
  return { camunda7Client, profileStore }
}

export function getPlugins(): AppPlugin<MCPServer>[] {
  const entries = getActiveAppEntries()
  const shared = buildSharedResources(entries)
  return entries
    .filter((entry) => MODULE_REGISTRY[entry.app])
    .map((entry) => MODULE_REGISTRY[entry.app].createPlugin(entry.config, shared))
}
