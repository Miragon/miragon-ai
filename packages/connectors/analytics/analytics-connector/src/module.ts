import { z } from "zod"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"
import { createPlugin } from "./plugin.js"
import { analyticsToolsets } from "./toolsets.js"
import { analyticsInstructions } from "./instructions.js"
import type { FetchBpmnXml } from "./widget-tools.js"
import type { ProfileSource } from "./server-locale.js"
import { NO_ENGINE_SCOPE_MESSAGE } from "./engine-ids.js"

/**
 * Self-contained module definition for host apps: everything the app needs to
 * mount the analytics module without knowing its config surface. Conforms
 * structurally to the app's `ModuleDefinition` port — no import of the app.
 */

/** The longest delay a Node timer holds — a longer deadline would fire at once. */
const MAX_TIMEOUT_MS = 2_147_483_647

const HEADERS_ERROR =
  'PROMETHEUS_HEADERS must be a JSON object of string header values, e.g. {"X-Scope-OrgID":"tenant-a"}'

/** `PROMETHEUS_HEADERS` JSON text (env) or an object (direct caller) → a header record. */
const headersSchema = z
  .union([
    z.record(z.string(), z.string()),
    z.string().transform((text, ctx) => {
      try {
        return JSON.parse(text) as unknown
      } catch {
        // Never echo the text: header values are often secrets (API keys).
        ctx.addIssue({ code: "custom", message: HEADERS_ERROR })
        return z.NEVER
      }
    }),
  ])
  .pipe(z.record(z.string(), z.string({ error: HEADERS_ERROR }), { error: HEADERS_ERROR }))

const analyticsConfigSchema = z.object({
  url: z.string().default("http://localhost:9090"),
  /**
   * Prometheus auth (all optional): a bearer token, OR basic auth — explicit
   * username + password or userinfo in `url` — plus extra headers (tenant
   * ids). The client rejects ambiguous combinations at boot and keeps every
   * credential out of model-visible errors.
   */
  bearerToken: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  headers: headersSchema.optional(),
  // PROMETHEUS_TIMEOUT_MS — strict: a typo fails the boot instead of being
  // coerced into some other deadline. Unset = the client default (30 s).
  timeoutMs: z
    .union([
      z.number(),
      z
        .string()
        .regex(/^\d+$/, "PROMETHEUS_TIMEOUT_MS must be a whole number of milliseconds")
        .transform(Number),
    ])
    .pipe(
      z
        .number()
        .int("PROMETHEUS_TIMEOUT_MS must be a whole number of milliseconds")
        .min(1, "PROMETHEUS_TIMEOUT_MS must be at least 1 ms")
        .max(MAX_TIMEOUT_MS, `PROMETHEUS_TIMEOUT_MS must be at most ${MAX_TIMEOUT_MS} ms`),
    )
    .optional(),
  /**
   * `ANALYTICS_ENGINE_IDS` — the engine ids a STANDALONE analytics boot may
   * read (comma-separated `engine_id` values). Only the fallback: when the
   * composition root injects its configured engines (`shared.engineIds`,
   * from camunda7) those win. See `engine-ids.ts`.
   */
  engineIds: z
    .union([
      z.array(z.string()),
      z.string().transform((text) =>
        text
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    ])
    .optional(),
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
  /**
   * The engine ids this server is configured for (the camunda7 module's
   * engines) — analytics reads only these. Wins over `ANALYTICS_ENGINE_IDS`.
   */
  engineIds?: readonly string[]
}

/**
 * The engine ids analytics covers: the injected ones, else
 * `ANALYTICS_ENGINE_IDS`, else none (fail-closed). Warns at boot for the two
 * surprising cases — no scope at all, and an env list the injected one
 * overrides.
 */
function effectiveEngineIds(
  injected: readonly string[] | undefined,
  fromEnv: readonly string[] | undefined,
): readonly string[] {
  if (injected && injected.length > 0) {
    if (fromEnv && fromEnv.length > 0) {
      console.warn(
        `[analytics] ANALYTICS_ENGINE_IDS is ignored: the server's configured engines (${injected.join(", ")}) scope analytics.`,
      )
    }
    return injected
  }
  if (fromEnv && fromEnv.length > 0) return fromEnv
  console.warn(`[analytics] ${NO_ENGINE_SCOPE_MESSAGE}`)
  return []
}

export const analyticsModule = {
  name: "analytics",

  /**
   * Pure env → raw-config mapping. `PROMETHEUS_URL` is trimmed so an empty
   * assignment (`PROMETHEUS_URL=` left in a .env or compose env_file) falls
   * through to the schema default instead of producing an invalid-URL client.
   */
  configFromEnv(env: NodeJS.ProcessEnv): Record<string, unknown> {
    // Blank = unset for every variable (a `KEY=` left in a .env file).
    // Credentials are passed verbatim otherwise — never trimmed into another secret.
    const trimmed = (name: string) => env[name]?.trim() || undefined
    const verbatim = (name: string) => (env[name]?.trim() ? env[name] : undefined)
    return {
      url: trimmed("PROMETHEUS_URL"),
      bearerToken: verbatim("PROMETHEUS_BEARER_TOKEN"),
      username: verbatim("PROMETHEUS_USERNAME"),
      password: verbatim("PROMETHEUS_PASSWORD"),
      headers: trimmed("PROMETHEUS_HEADERS"),
      timeoutMs: trimmed("PROMETHEUS_TIMEOUT_MS"),
      engineIds: trimmed("ANALYTICS_ENGINE_IDS"),
    }
  },

  /** This module's slice of the app's unknown-env-var typo warner. */
  knownEnvVars: [
    "PROMETHEUS_URL",
    "PROMETHEUS_BEARER_TOKEN",
    "PROMETHEUS_USERNAME",
    "PROMETHEUS_PASSWORD",
    "PROMETHEUS_HEADERS",
    "PROMETHEUS_TIMEOUT_MS",
    "ANALYTICS_ENGINE_IDS",
  ] as const,

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

  /**
   * The module's server-instructions snippet: what `engine` means here (a
   * metric filter over the configured engines — their fleet aggregate when
   * omitted, camunda7's saved default does not apply), the periods and the
   * health routing.
   */
  instructions(): string {
    return analyticsInstructions()
  },

  createPlugin(
    config: Record<string, unknown>,
    shared: AnalyticsModuleShared,
  ): AppPlugin<MCPServer> {
    const { toolset, engineIds, ...parsed } = analyticsConfigSchema.parse(config)
    return createPlugin({
      ...parsed,
      engineIds: effectiveEngineIds(shared.engineIds, engineIds),
      // Resolved once, here: missing → the read-only floor, unknown → warning +
      // floor. The plugin only ever sees a declared name.
      toolset: analyticsToolsets.resolve(toolset),
      fetchBpmnXml: shared.fetchBpmnXml,
      profileStore: shared.profileStore,
    })
  },
}
