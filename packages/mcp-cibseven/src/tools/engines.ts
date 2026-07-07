import { z } from "zod"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { UnknownEngineError, type EngineRegistry, type EngineEntry } from "../lib/resolve-engine.js"
import type { ProfileStore } from "../lib/profile-store.js"
import { resolveProfileKey } from "../lib/resolve-profile-key.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

/**
 * Registers the consolidated engine-management tool that lets the MCP host
 * discover available engines and pick which one operations tools route to
 * for this session:
 *
 *   - `camunda7_engine` action `"list"`    → list registered engines.
 *   - `camunda7_engine` action `"select"`  → set the sticky engine for this session.
 *   - `camunda7_engine` action `"current"` → report which engine is currently sticky.
 */
export function registerEngineTools(register: Register, profileStore: ProfileStore): void {
  // The user-profile `allowedEngineIds` curates which engines the session may
  // pick from. An empty/absent allow-list means "all" — never lock the session
  // out of every engine. Read off the session/auth key; with no key (stdio) the
  // full list is returned. This is curation, not security: an explicit per-call
  // `engine` override still reaches any configured engine.
  const allowedEnginesFor = async (reg: EngineRegistry): Promise<EngineEntry[]> => {
    const key = resolveProfileKey()
    const profile = key ? await profileStore.get(key) : undefined
    const allowed = profile?.allowedEngineIds
    if (!allowed || allowed.length === 0) return reg.engines
    const filtered = reg.engines.filter((e) => allowed.includes(e.id))
    // Guard against a stale allow-list that no longer matches any configured
    // engine — fall back to all rather than rendering an empty picker.
    return filtered.length > 0 ? filtered : reg.engines
  }

  register({
    name: "camunda7_engine",
    category: "engines",
    description:
      "Manage which CIB Seven / Camunda 7 engine this MCP session talks to. " +
      'action="list" returns the engines available to this profile, the current sticky selection, ' +
      "and the profile's default engine (if set; a hint for the cockpit's landing engine, not a selection); " +
      'action="select" (requires engineId) makes that engine the sticky default for all ' +
      "subsequent operations tool calls in this session until selected again; " +
      'action="current" reports the sticky selection (or null). ' +
      "With more than one engine configured, list then select before calling operations tools — " +
      "or pass the per-call `engine` parameter to override the sticky selection for a single call.",
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
          // The cockpit seeds its landing engine from the profile default when
          // nothing is sticky-selected yet (and the default is still available).
          // Kept on its own field: `currentSelection` stays the *actual* sticky
          // selection so it agrees with action "current" and the engine
          // operations route — a non-sticky default must not read as selected.
          const key = resolveProfileKey()
          const profile = key ? await profileStore.get(key) : undefined
          const profileDefaultEngineId =
            profile?.defaultEngineId && available.some((e) => e.id === profile.defaultEngineId)
              ? profile.defaultEngineId
              : null
          return {
            engines: available.map((e) => ({
              id: e.id,
              baseUrl: e.baseUrl,
              ...(e.cockpitUrl ? { cockpitUrl: e.cockpitUrl } : {}),
            })),
            currentSelection: reg.backends.getSelected() ?? null,
            profileDefaultEngineId,
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
          reg.backends.select(id)
          return { selected: id }
        }
        case "current":
          return { engineId: reg.backends.getSelected() ?? null }
      }
    },
  })
}
