import fs from "node:fs"
import { z } from "zod"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"
import { getProcessDefinitionBpmn20XmlByKey } from "@miragon-ai/camunda7-client/sdk"
import { createPlugin, type Camunda7SharedResources } from "./plugin.js"
import { providerForEntry } from "./providers/index.js"

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
  /**
   * Environment this engine's service runs in — a grouping level for the
   * two-stage environment→engine selection, never part of the engine identity
   * (`id` stays the flat join key against the metrics' `engine_id` label).
   */
  environment: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      "Environment id must be lowercase alphanumeric / dashes, starting with a letter or digit",
    )
    // A purely numeric id would be an array-index-like JSON key, which JS
    // object enumeration reorders FIRST — silently breaking the "pickers list
    // environments in config order" contract and shifting engines[0] (the
    // BPMN-XML source engine). Reject it loudly instead.
    .regex(/^(?!\d+$)/, "Environment id must not be purely numeric")
    .optional(),
  /** Engine vendor of the C7 dialect (selects the provider). Default: "cibseven". */
  flavor: z.enum(["cibseven", "operaton", "camunda7"]).optional(),
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
  // Engine ids must be unique ACROSS environments: the id is the flat join key
  // against the metrics' engine_id label and the per-call `engine` override —
  // a duplicate would silently route both entries' traffic to one of them.
  .refine((c) => new Set(c.engines.map((e) => e.id)).size === c.engines.length, {
    message:
      "Engine ids must be unique across all environments — the id is the per-call `engine` selector and the join key against the metrics' engine_id label",
  })

/** End index of the JSON string literal opening at `openQuote` (escape-aware). */
function scanJsonString(text: string, openQuote: number): number {
  let j = openQuote + 1
  while (j < text.length && text[j] !== '"') {
    if (text[j] === "\\") j++
    j++
  }
  return j
}

/**
 * Rejects duplicate top-level keys in the environment-map JSON text. JSON.parse
 * resolves duplicates last-wins BEFORE any consumer can see them, so a repeated
 * environment key (a classic hand-edited-ConfigMap slip) would silently drop a
 * whole block of engines — the boot would succeed with fewer engines and the
 * only symptom would be stale defaults failing soft. Only depth-1 keys count:
 * engine entries repeat "id"/"baseUrl" per engine by design.
 */
function assertUniqueTopLevelKeys(rawText: string): void {
  if (!rawText.trimStart().startsWith("{")) return
  const seen = new Set<string>()
  let depth = 0
  let i = 0
  while (i < rawText.length) {
    const c = rawText[i]
    if (c === '"') {
      const j = scanJsonString(rawText, i)
      const key = rawText.slice(i + 1, j)
      let k = j + 1
      while (k < rawText.length && /\s/.test(rawText[k])) k++
      if (depth === 1 && rawText[k] === ":") {
        if (seen.has(key)) {
          throw new Error(
            `Engine config: duplicate environment key "${key}" — JSON keeps only the LAST duplicate, silently dropping the other block's engines. Merge the blocks into one array.`,
          )
        }
        seen.add(key)
      }
      i = j + 1
      continue
    }
    if (c === "{" || c === "[") depth++
    else if (c === "}" || c === "]") depth--
    i++
  }
}

/**
 * Normalizes the two accepted engine-config JSON forms to the flat entry list
 * the config schema validates:
 *   - Array form: `[{id, baseUrl, environment?, …}, …]` — passed through.
 *   - Environment-map form: `{"prod-eu": [{id, baseUrl, …}, …], …}` — each key
 *     is an environment id stamped onto its entries' `environment` field.
 *
 * The map form is the "pick an environment, then an engine" configuration
 * shape: environments hold services, and the services that carry an engine are
 * listed under their environment. A per-entry `environment` inside a map value
 * that contradicts its key is a config error — silently preferring either side
 * would misfile the engine in every picker.
 */

function normalizeEnginesConfig(raw: unknown): unknown {
  if (Array.isArray(raw) || typeof raw !== "object" || raw === null) return raw
  return Object.entries(raw).flatMap(([environment, engines]) => {
    if (!Array.isArray(engines)) {
      throw new Error(
        `Engine config environment "${environment}" must map to an ARRAY of engine entries — got ${typeof engines}. Environment-map form: {"<environment>": [{id, baseUrl, …}, …], …}.`,
      )
    }
    return engines.map((engine: unknown) => {
      if (engine && typeof engine === "object") {
        const own = (engine as { environment?: unknown }).environment
        if (own !== undefined && own !== environment) {
          throw new Error(
            `Engine config: entry under environment "${environment}" carries a contradicting environment ${JSON.stringify(own)} — drop the per-entry field or move the entry.`,
          )
        }
        return { ...engine, environment }
      }
      return engine
    })
  })
}

/**
 * Resolves the engine list from environment in this order of precedence:
 *   1. `CAMUNDA_ENGINES_FILE` — path to a JSON document (preferred at scale; fits ConfigMap workflows).
 *   2. `CAMUNDA_ENGINES_JSON` — inline JSON.
 *   3. `CAMUNDA_BASE_URL` (+ `CAMUNDA_COCKPIT_URL`) — backward-compat single-engine,
 *      synthesized as `id: CAMUNDA_ENGINE_ID ?? "default"`.
 *
 * Both JSON sources accept the flat array form and the environment-map form
 * (see [[normalizeEnginesConfig]]). Falls back to the local default engine
 * (`http://localhost:8410/engine-rest`) when nothing is set.
 *
 * `CAMUNDA_ENGINE_ID` exists because the engine id is a JOIN KEY, not a label:
 * the metrics plugin stamps its own `ENGINE_ID` onto every series as
 * `engine_id`, and every analytics query scoped to an engine (the cockpit's
 * BPMN heatmap, engine compare, …) matches on it. Without a way to name the
 * single-engine shorthand, the only alignment option was switching to the JSON
 * form — and a mismatch reads as "no data", not as a config error.
 */
function loadEnginesFromEnv(env: NodeJS.ProcessEnv): unknown {
  const filePath = env.CAMUNDA_ENGINES_FILE?.trim()
  if (filePath) {
    const raw = fs.readFileSync(filePath, "utf8")
    assertUniqueTopLevelKeys(raw)
    return normalizeEnginesConfig(JSON.parse(raw))
  }
  const json = env.CAMUNDA_ENGINES_JSON?.trim()
  if (json) {
    assertUniqueTopLevelKeys(json)
    return normalizeEnginesConfig(JSON.parse(json))
  }
  const id = env.CAMUNDA_ENGINE_ID?.trim() || "default"
  const legacyBaseUrl = env.CAMUNDA_BASE_URL?.trim()
  if (legacyBaseUrl) {
    return [
      {
        id,
        baseUrl: legacyBaseUrl,
        ...(env.CAMUNDA_COCKPIT_URL ? { cockpitUrl: env.CAMUNDA_COCKPIT_URL } : {}),
      },
    ]
  }
  return [{ id, baseUrl: "http://localhost:8410/engine-rest" }]
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
    "CAMUNDA_ENGINE_ID",
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

  /**
   * Boot-time hints for active deployments. With no engine env at all the
   * module silently falls back to `http://localhost:8410/engine-rest` — which
   * reaches the repo's Compose engine, so BPM tools work while engine-scoped
   * analytics (heatmap, engine compare) join on a mismatched `engine_id` and
   * read as "no data", not as a config error. Mirrors the analytics module's
   * PROMETHEUS_URL warning.
   */
  bootWarnings(env: NodeJS.ProcessEnv): string[] {
    const configured =
      env.CAMUNDA_ENGINES_FILE?.trim() ||
      env.CAMUNDA_ENGINES_JSON?.trim() ||
      env.CAMUNDA_BASE_URL?.trim()
    if (configured) return []
    const id = env.CAMUNDA_ENGINE_ID?.trim() || "default"
    return [
      `No engine is configured (CAMUNDA_ENGINES_FILE / CAMUNDA_ENGINES_JSON / CAMUNDA_BASE_URL) — defaulting to http://localhost:8410/engine-rest with engine id "${id}". That id is the join key against the metrics' engine_id label: engine-scoped analytics return empty when it does not match the ENGINE_ID the engine stamps (the repo's Compose stack stamps "prod-a" — set CAMUNDA_ENGINE_ID to match).`,
    ]
  },

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
  // Same client construction (incl. passthrough semantics) as the plugin's
  // registry clients — via the entry's vendor provider.
  const client = providerForEntry(primary).createClient(primary, auth)
  return async (processDefinitionKey) => {
    const xmlResp = (await getProcessDefinitionBpmn20XmlByKey({
      client,
      path: { key: processDefinitionKey },
    }).catch(() => null)) as { bpmn20Xml?: string } | null
    return xmlResp?.bpmn20Xml ?? null
  }
}
