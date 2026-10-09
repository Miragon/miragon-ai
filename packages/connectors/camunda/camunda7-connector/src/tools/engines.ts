import { z } from "zod"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { saveModuleSlice, type ProfileStore } from "@miragon-ai/widget-shell/server"
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
import { CAMUNDA7_LIST_ENGINES, CAMUNDA7_SELECT_ENGINE } from "../tool-names.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

/**
 * Registers the engine-management pair:
 *
 *   - `camunda7_list_engines` — the engines available to the caller's profile,
 *     grouped by environment, plus the saved default. A genuine read
 *     (`readOnlyHint`), so it exists in every toolset — it is what a
 *     read-only multi-engine deployment needs to route queries.
 *   - `camunda7_select_engine` — saves an engine as the caller's default
 *     (`profile.modules.camunda7.defaultEngineId` — durable, same identity as
 *     all settings). A write, so the toolset filter keeps it out of
 *     `read-only`, exactly like `camunda7_save_user_profile` (the same field).
 *
 * Neither talks to an engine: they read the configured registry and write the
 * local profile store (`openWorldHint: false`).
 */
export function registerEngineTools(register: Register, profileStore: ProfileStore): void {
  // The user-profile `allowedEngineIds` curates which engines the caller may
  // pick from (shared rule: `allowedEngines`). Advisory like the default
  // engine: a profile-store outage lists every engine instead of failing the
  // one tool a multi-engine caller needs to route (select still fails
  // visibly — at its write). The caller resolves from the handler ctx, the
  // same `resolveProfileKey` the engine routing's saved-default lookup uses,
  // so these tools and the routing always agree on whose profile they read.
  const allowedEnginesFor = async (reg: EngineRegistry, ctx: unknown): Promise<EngineEntry[]> =>
    allowedEngines(await advisoryCamunda7Settings(profileStore, ctx), reg.engines)

  register({
    name: CAMUNDA7_LIST_ENGINES,
    category: "engines",
    description:
      "List the engines available to this profile, grouped by environment (`environments` maps each " +
      "to its engine ids), plus the caller's saved default engine (`defaultEngineId`, null when none).",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: {},
    handler: async (reg: EngineRegistry, _args, ctx) => {
      const available = await allowedEnginesFor(reg, ctx)
      return {
        // Deliberately WITHOUT the engine's REST baseUrl: it is internal
        // network topology the model never needs (it routes by `id`); only
        // an explicitly configured, user-facing cockpitUrl is shown.
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
        defaultEngineId: (await profileDefaultEngineId(profileStore, reg.engines, ctx)) ?? null,
      }
    },
  })

  register({
    name: CAMUNDA7_SELECT_ENGINE,
    category: "engines",
    description:
      "Save an engine as the caller's default: camunda7 tool calls without `engine` then route to it " +
      "(a durable per-user setting, the same field the settings page edits). Needs a signed-in caller.",
    // Overwrites only the caller's own default — idempotent, never destructive.
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      engineId: z.string().min(1).describe('Engine id to save as the default, e.g. "prod-a"'),
    },
    handler: async (reg: EngineRegistry, args, ctx) => {
      const id = args.engineId
      if (!reg.engines.some((e) => e.id === id)) {
        throw new UnknownEngineError(id, reg.engines)
      }
      const available = await allowedEnginesFor(reg, ctx)
      if (!available.some((e) => e.id === id)) {
        throw new Error(
          `Engine "${id}" is not available for this profile. ` +
            `Available: ${available.map((e) => e.id).join(", ")}. ` +
            "Update your profile (camunda7_save_user_profile) to widen allowedEngineIds.",
        )
      }
      // Keyless refusal mirrors requireProfileKey (the shared slice-write
      // contract) with the select-specific remediation: the per-call
      // override needs no identity at all.
      const key = resolveProfileKey(ctx)
      if (!key) {
        throw new Error(
          "No caller identity to save a default engine under — a saved default is per signed-in user (the server needs MCP_OAUTH); " +
            "pass the per-call `engine` parameter instead.",
        )
      }
      // The patch alone (the shared slice-write contract): the store merges
      // it under its per-key lock, so a settings save racing this select
      // keeps its fields and cannot revert the new default. The OAuth caller
      // is stamped as the record's owner (same pair as every settings save).
      await saveModuleSlice(
        profileStore,
        key,
        CAMUNDA7_MODULE_KEY,
        { defaultEngineId: id },
        { userId: resolveAuthUserId(ctx) },
      )
      return { defaultEngineId: id }
    },
  })
}
