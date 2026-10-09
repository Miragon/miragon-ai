import { z } from "zod"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { mergeRawSlice, type ProfileStore } from "@miragon-ai/widget-shell/server"
import { UnknownEngineError, type EngineRegistry, type EngineEntry } from "../lib/resolve-engine.js"
import { environmentOf, groupEnginesByEnvironment } from "../lib/environments.js"
import { providerForEntry } from "../providers/index.js"
import {
  advisoryCamunda7Settings,
  allowedEngines,
  profileDefaultEngineId,
} from "../lib/engine-preferences.js"
import { CAMUNDA7_MODULE_KEY } from "../lib/profile-schema.js"
import { resolveAuthUserId, resolveProfileKey } from "../lib/resolve-profile-key.js"
import { allowsProfileSave, type Camunda7Toolset } from "../lib/toolsets.js"
import { CAMUNDA7_ENGINE } from "../tool-names.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

const ENGINE_ACTIONS = ["list", "select", "current"] as const
type EngineAction = (typeof ENGINE_ACTIONS)[number]
/** What a toolset WITHOUT profile writes offers — `select` is the durable action. */
const READ_ACTIONS = ["list", "current"] as const

const DESCRIPTION_LEAD =
  "Manage which CIB Seven / Camunda 7 engine operations tools talk to. " +
  'action="list" returns the engines available to this profile grouped by ENVIRONMENT ' +
  "(`environments` maps each environment to its engine ids; every engine entry names its `environment`) " +
  "plus the saved default engine (if any) — pick an environment first, then one of its engines; "
const DESCRIPTION_SELECT =
  'action="select" (requires engineId) saves that engine as the caller\'s default — ' +
  "all subsequent operations tool calls without a per-call `engine` override route to it " +
  "(a durable per-user setting, the same field the settings page edits); "
const DESCRIPTION_TAIL =
  'action="current" reports the saved default engine (or null). ' +
  "With more than one engine configured, pass the per-call `engine` parameter or save a default first."
const DESCRIPTION_READ_ONLY_TAIL =
  'action="current" reports the saved default engine (or null). ' +
  "This deployment's toolset does not allow saving a default engine — with more than one engine " +
  "configured, pass the per-call `engine` parameter."

/**
 * Registers the consolidated engine-management tool that lets the MCP host
 * discover available engines and save which one operations tools route to
 * when no per-call `engine` override is given:
 *
 *   - `camunda7_engine` action `"list"`    → list registered engines + the saved default.
 *   - `camunda7_engine` action `"select"`  → save an engine as the caller's default
 *     (`profile.modules.camunda7.defaultEngineId` — durable, same identity as all settings).
 *   - `camunda7_engine` action `"current"` → report the saved default engine.
 *
 * The tool exists in every toolset — its reads are what a read-only
 * multi-engine deployment needs to route queries — but its SHAPE follows the
 * toolset, decided at registration: where the profile write is not allowed
 * (`read-only`) it registers as a genuine read-only tool (`readOnlyHint`,
 * actions `list`/`current` only), so `read-only` lists strictly
 * `readOnlyHint` tools, with no exemption.
 */
export function registerEngineTools(
  register: Register,
  profileStore: ProfileStore,
  toolset: Camunda7Toolset,
): void {
  // "select" writes the SAME profile field the settings save tool owns, so it
  // shares exactly that tool's toolset decision.
  const canSaveDefault = allowsProfileSave(toolset)
  // The action schema is typed over every action so the handler keeps its
  // `select` guard (defense in depth: a caller bypassing the advertised enum
  // still hits the refusal below).
  const actionSchema: z.ZodType<EngineAction> = canSaveDefault
    ? z.enum(ENGINE_ACTIONS)
    : z.enum(READ_ACTIONS)

  // The user-profile `allowedEngineIds` curates which engines the caller may
  // pick from (shared rule: `allowedEngines`). Advisory like the default
  // engine: a profile-store outage lists every engine instead of failing the
  // one tool a multi-engine caller needs to route (select still fails
  // visibly — at its write). The lookup resolves the caller off the ambient
  // request context (argument-less `resolveProfileKey`) although the toolkit
  // 2.6 registrar hands the handler mcp-use's ctx: the engine routing's
  // saved-default lookup (`profileDefaultEngineId`) has no ctx and reads
  // through the same `advisoryCamunda7Settings`, so this tool and the routing
  // always agree on whose profile they read.
  const allowedEnginesFor = async (reg: EngineRegistry): Promise<EngineEntry[]> =>
    allowedEngines(await advisoryCamunda7Settings(profileStore), reg.engines)

  register({
    name: CAMUNDA7_ENGINE,
    category: "engines",
    description: canSaveDefault
      ? DESCRIPTION_LEAD + DESCRIPTION_SELECT + DESCRIPTION_TAIL
      : DESCRIPTION_LEAD + DESCRIPTION_READ_ONLY_TAIL,
    // "select" only overwrites the caller's own default (idempotent, never
    // destructive) — the read-only variant has no write at all.
    annotations: canSaveDefault
      ? { idempotentHint: true, destructiveHint: false }
      : { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      action: actionSchema.describe("Engine-management action to perform."),
      engineId: z
        .string()
        .optional()
        .describe('Engine id to select (required for action="select"), e.g. "prod-a".'),
    },
    handler: async (reg: EngineRegistry, args) => {
      const action = args.action
      switch (action) {
        case "list": {
          const available = await allowedEnginesFor(reg)
          return {
            // Deliberately WITHOUT the engine's REST baseUrl: it is internal
            // network topology the model never needs (it routes by `id`);
            // only an explicitly configured, user-facing cockpitUrl is shown.
            engines: available.map((e) => {
              const provider = providerForEntry(e)
              return {
                id: e.id,
                environment: environmentOf(e),
                flavor: provider.flavor,
                engineName: provider.branding.displayName,
                ...(e.cockpitUrl ? { cockpitUrl: e.cockpitUrl } : {}),
              }
            }),
            // The environment→engine map over the same allowed engines — the
            // two-stage selection view (pick an environment, then an engine).
            environments: groupEnginesByEnvironment(available).map((g) => ({
              id: g.id,
              engineIds: g.engines.map((e) => e.id),
            })),
            // The saved default (validated against the allowed engines) — the
            // engine operations tools use when no per-call override is given,
            // and the cockpit's landing engine.
            defaultEngineId: (await profileDefaultEngineId(profileStore, reg.engines)) ?? null,
          }
        }
        case "select": {
          const id = args.engineId ? String(args.engineId) : ""
          if (!id) {
            throw new Error('action="select" requires an engineId (see action="list" for ids)')
          }
          if (!reg.engines.some((e) => e.id === id)) {
            throw new UnknownEngineError(id, reg.engines)
          }
          const available = await allowedEnginesFor(reg)
          if (!available.some((e) => e.id === id)) {
            throw new Error(
              `Engine "${id}" is not available for this profile. ` +
                `Available: ${available.map((e) => e.id).join(", ")}. ` +
                "Update your profile (camunda7_save_user_profile) to widen allowedEngineIds.",
            )
          }
          if (!canSaveDefault) {
            throw new Error(
              "This deployment's toolset does not allow saving a default engine (durable write) — " +
                "pass the per-call `engine` parameter instead.",
            )
          }
          // Keyless refusal mirrors requireProfileKey (the shared slice-write
          // contract) with the select-specific remediation: the per-call
          // override needs no identity at all.
          const key = resolveProfileKey()
          if (!key) {
            throw new Error(
              "No caller identity to save a default engine under (mcp-use 2 issues no MCP session ids) — " +
                "pass the per-call `engine` parameter instead, or configure MCP_OAUTH so the default persists per user.",
            )
          }
          const nextSlice = await mergeRawSlice(profileStore, key, CAMUNDA7_MODULE_KEY, {
            defaultEngineId: id,
          })
          // Stamping the auth user id marks the record user-bound — exempt
          // from the session-TTL cleanup (same pair as every settings save).
          await profileStore.save(
            key,
            { modules: { [CAMUNDA7_MODULE_KEY]: nextSlice } },
            { userId: resolveAuthUserId() },
          )
          return { defaultEngineId: id }
        }
        case "current":
          return {
            defaultEngineId: (await profileDefaultEngineId(profileStore, reg.engines)) ?? null,
          }
      }
    },
  })
}
