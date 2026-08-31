import { z } from "zod"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { mergeRawSlice, type ProfileStore } from "@miragon-ai/widget-shell/server"
import { UnknownEngineError, type EngineRegistry, type EngineEntry } from "../lib/resolve-engine.js"
import { environmentOf, groupEnginesByEnvironment } from "../lib/environments.js"
import { providerForEntry } from "../providers/index.js"
import { allowedEngines, profileDefaultEngineId } from "../lib/engine-preferences.js"
import { parseCamunda7Settings, CAMUNDA7_MODULE_KEY } from "../lib/profile-schema.js"
import { resolveAuthUserId, resolveProfileKey } from "../lib/resolve-profile-key.js"
import { isToolInToolset, resolveCamunda7Toolset } from "../lib/toolsets.js"
import { CAMUNDA7_ENGINE, CAMUNDA7_SAVE_USER_PROFILE } from "../tool-names.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

/**
 * Registers the consolidated engine-management tool that lets the MCP host
 * discover available engines and save which one operations tools route to
 * when no per-call `engine` override is given:
 *
 *   - `camunda7_engine` action `"list"`    → list registered engines + the saved default.
 *   - `camunda7_engine` action `"select"`  → save an engine as the caller's default
 *     (`profile.modules.camunda7.defaultEngineId` — durable, same identity as all settings).
 *   - `camunda7_engine` action `"current"` → report the saved default engine.
 */
export function registerEngineTools(
  register: Register,
  profileStore: ProfileStore,
  toolset?: string,
): void {
  // "select" writes the SAME profile field the settings save tool owns, so it
  // shares exactly that tool's toolset decision — never the engine tool's own
  // name, which the session-infrastructure allowance keeps registered in every
  // toolset for the read actions (see SESSION_INFRASTRUCTURE_TOOLS).
  const resolvedToolset = resolveCamunda7Toolset(toolset)
  const canSaveDefault =
    resolvedToolset === undefined ||
    isToolInToolset(
      { name: CAMUNDA7_SAVE_USER_PROFILE, annotations: { idempotentHint: true } },
      resolvedToolset,
    )

  // The user-profile `allowedEngineIds` curates which engines the caller may
  // pick from (shared rule: `allowedEngines`). resolveProfileKey
  // (argument-less: registrar handlers get no ctx) resolves auth user id →
  // session id → stdio-anonymous off the request context.
  const allowedEnginesFor = async (reg: EngineRegistry): Promise<EngineEntry[]> => {
    const key = resolveProfileKey()
    const profile = key ? await profileStore.get(key) : undefined
    return allowedEngines(parseCamunda7Settings(profile), reg.engines)
  }

  register({
    name: CAMUNDA7_ENGINE,
    category: "engines",
    description:
      "Manage which CIB Seven / Camunda 7 engine operations tools talk to. " +
      'action="list" returns the engines available to this profile grouped by ENVIRONMENT ' +
      "(`environments` maps each environment to its engine ids; every engine entry names its `environment`) " +
      "plus the saved default engine (if any) — pick an environment first, then one of its engines; " +
      'action="select" (requires engineId) saves that engine as the caller\'s default — ' +
      "all subsequent operations tool calls without a per-call `engine` override route to it " +
      "(a durable per-user setting, the same field the settings page edits); " +
      'action="current" reports the saved default engine (or null). ' +
      "With more than one engine configured, pass the per-call `engine` parameter or save a default first.",
    annotations: { idempotentHint: true },
    inputSchema: {
      action: z
        .enum(["list", "select", "current"])
        .describe("Engine-management action to perform."),
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
            engines: available.map((e) => {
              const provider = providerForEntry(e)
              return {
                id: e.id,
                baseUrl: e.baseUrl,
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
