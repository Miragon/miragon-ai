import fs from "node:fs"
import { z } from "zod"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import { createCamunda7Client } from "@miragon-ai/client-camunda7"
import { getProcessDefinitionBpmn20XmlByKey } from "@miragon-ai/client-camunda7/sdk"
import { createPlugin, type Camunda7SharedResources } from "./plugin.js"
import { resolveMcpBearerToken } from "./lib/mcp-auth.js"

/**
 * Self-contained module definition for host apps: config schema, env mapping,
 * and known env vars live HERE, next to the plugin they configure — the app
 * only selects modules and wires cross-module resources. Conforms structurally
 * to the app's `ModuleDefinition` port — no import of the app.
 */

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

export const camunda7ConfigSchema = z
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

/**
 * Resolves the engine list from environment in this order of precedence:
 *   1. `CAMUNDA_ENGINES_FILE` — path to a JSON array (preferred at scale; fits ConfigMap workflows).
 *   2. `CAMUNDA_ENGINES_JSON` — inline JSON array.
 *   3. `CAMUNDA_BASE_URL` (+ `CAMUNDA_COCKPIT_URL`) — backward-compat single-engine,
 *      synthesized as `id: "default"`.
 *
 * Falls back to the local default engine (`http://localhost:8410/engine-rest`)
 * when nothing is set.
 */
function loadEnginesFromEnv(env: NodeJS.ProcessEnv): unknown {
  const filePath = env.CAMUNDA_ENGINES_FILE?.trim()
  if (filePath) {
    const raw = fs.readFileSync(filePath, "utf8")
    return JSON.parse(raw)
  }
  const json = env.CAMUNDA_ENGINES_JSON?.trim()
  if (json) {
    return JSON.parse(json)
  }
  const legacyBaseUrl = env.CAMUNDA_BASE_URL?.trim()
  if (legacyBaseUrl) {
    return [
      {
        id: "default",
        baseUrl: legacyBaseUrl,
        ...(env.CAMUNDA_COCKPIT_URL ? { cockpitUrl: env.CAMUNDA_COCKPIT_URL } : {}),
      },
    ]
  }
  return [{ id: "default", baseUrl: "http://localhost:8410/engine-rest" }]
}

export const camunda7Module = {
  name: "camunda7",

  /** Pure env → raw-config mapping; validation happens in `createPlugin`. */
  configFromEnv(env: NodeJS.ProcessEnv): Record<string, unknown> {
    return {
      engines: loadEnginesFromEnv(env),
      authType: env.CAMUNDA_AUTH_TYPE,
      username: env.CAMUNDA_USERNAME,
      password: env.CAMUNDA_PASSWORD,
      token: env.CAMUNDA_TOKEN,
      incidentIssueRepository: env.CAMUNDA_INCIDENT_ISSUE_REPO,
      // Engine-health verdict thresholds — only forwarded when set, so the
      // module's defaults apply otherwise.
      ...(env.CAMUNDA_HEALTH_CRITICAL_INCIDENTS || env.CAMUNDA_HEALTH_CRITICAL_CLUSTER_SIZE
        ? {
            healthThresholds: {
              criticalIncidents: env.CAMUNDA_HEALTH_CRITICAL_INCIDENTS,
              criticalClusterSize: env.CAMUNDA_HEALTH_CRITICAL_CLUSTER_SIZE,
            },
          }
        : {}),
    }
  },

  /** This module's slice of the app's unknown-env-var typo warner. */
  knownEnvVars: [
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
  ] as const,

  supportsToolsets: true,

  createPlugin(
    config: Record<string, unknown>,
    shared: Camunda7SharedResources,
  ): AppPlugin<MCPServer> {
    return createPlugin(camunda7ConfigSchema.parse(config), { profileStore: shared.profileStore })
  },
}

/**
 * Builds an engine-agnostic BPMN-XML lookup from this module's raw config —
 * the piece other modules (analytics' heatmap) consume via injection instead
 * of depending on the engine SDK. Uses the FIRST configured engine with the
 * same per-engine-auth-wins precedence as the plugin's registry clients; when
 * a process definition exists on more than one engine the XML is assumed to
 * match across engines. Fetch errors resolve to `null` (consumer degrades).
 */
export function createBpmnXmlFetcher(
  config: Record<string, unknown>,
): ((processDefinitionKey: string) => Promise<string | null>) | undefined {
  const parsed = camunda7ConfigSchema.parse(config)
  const primary = parsed.engines[0]
  const auth = primary.auth ?? {
    type: parsed.authType,
    username: parsed.username,
    password: parsed.password,
    token: parsed.token,
  }
  const client = createCamunda7Client({
    baseUrl: primary.baseUrl,
    authType: auth.type,
    username: auth.username,
    password: auth.password,
    token: auth.token,
    // Same passthrough semantics as the plugin's registry clients — without it
    // the XML fetch would silently 401 behind a passthrough deployment.
    tokenProvider: auth.type === "passthrough" ? resolveMcpBearerToken : undefined,
  })
  return async (processDefinitionKey) => {
    const xmlResp = (await getProcessDefinitionBpmn20XmlByKey({
      client,
      path: { key: processDefinitionKey },
    }).catch(() => null)) as { bpmn20Xml?: string } | null
    return xmlResp?.bpmn20Xml ?? null
  }
}
