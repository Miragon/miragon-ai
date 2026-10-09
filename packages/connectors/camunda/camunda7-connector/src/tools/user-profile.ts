import type { MCPServer } from "mcp-use"
import {
  appOnly,
  buildDataFeedResult as rawData,
  buildSingleWidgetView,
  requireProfileKey,
  showToolBinding,
  withToolErrors,
  type ProfileStore,
  strictToolInput,
} from "@miragon-ai/widget-shell/server"
import { allowsProfileSave, type Camunda7Toolset } from "../lib/toolsets.js"
import {
  CAMUNDA7_SAVE_USER_PROFILE,
  CAMUNDA7_SHOW_USER_PROFILE,
  CAMUNDA7_USER_PROFILE_DATA,
} from "../tool-names.js"
import {
  CAMUNDA7_MODULE_KEY,
  defaultUserProfile,
  toUserProfile,
  userProfileToolSaveInput,
  type UserProfile,
  type UserProfileView,
} from "../lib/profile-schema.js"
import { resolveAuthUserId, resolveProfileKey } from "../lib/resolve-profile-key.js"
import { environmentOf } from "../lib/environments.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { translator } from "../messages/index.js"

/**
 * One-line, model-facing summary of a profile — localized to the profile's own
 * language (steers the model toward responding in that language; the MCP server
 * cannot force the model's output language).
 */
function summarize(p: UserProfile): string {
  const engines =
    p.allowedEngineIds && p.allowedEngineIds.length > 0
      ? translator(p.language, "profile.summary.someEngines", { count: p.allowedEngineIds.length })
      : translator(p.language, "profile.summary.allEngines")
  const defaultDashboard = p.defaultDashboardId
    ? translator(p.language, "profile.summary.defaultDashboard", { id: p.defaultDashboardId })
    : ""
  return translator(p.language, "profile.summary", {
    language: p.language,
    theme: p.theme,
    engines,
    defaultDashboard,
  })
}

/**
 * Registers the user-profile tool surface (the three render paths, per the
 * CLAUDE.md invariant):
 *   - `camunda7_show_user_profile`  — widget tool (renders the settings panel),
 *   - `camunda7_user_profile_data`  — app-only feed (backs the widget self-fetch),
 *   - `camunda7_save_user_profile`  — model-visible write (partial update).
 *
 * All three resolve the profile key from the request (the OAuth caller — see
 * `resolveProfileKey`) and never talk to an engine; the engine *registry* is read only for the full
 * configured engine list the settings UI offers as availability checkboxes.
 *
 * The save tool is a durable write (shared profile store), so it honors
 * the deployment's toolset like every registrar write: absent in `read-only`,
 * present in `operations`/`admin`. The two view tools are always registered and
 * carry the decision as `canSave`, so the panel's Save button and the tool
 * surface can never disagree (mirrors analytics' `registerSettingsTools`).
 */
export function registerUserProfileTools(
  server: MCPServer,
  store: ProfileStore,
  registry: EngineRegistry,
  toolset: Camunda7Toolset,
): void {
  // The save tool is a durable write registered OUTSIDE the registrar, so it
  // gates itself against the (already concrete) toolset — the same registrar
  // rule, via the one profile-write decision `camunda7_engine`'s "select"
  // shares. Decided up front because the two view tools report the outcome as
  // `canSave`, which is what hides the panel's Save button; a view that
  // claimed otherwise would offer a write that resolves to an unknown tool.
  const canSave = allowsProfileSave(toolset)

  const loadView = async (ctx: unknown): Promise<UserProfileView> => {
    // Same key resolution as the save path, so a save is always read back. A
    // request without OAuth resolves no key and renders the defaults — the
    // NORM on an unauthenticated deployment.
    const key = resolveProfileKey(ctx)
    const record = key ? await store.get(key) : undefined
    return {
      profile: record ? toUserProfile(record) : defaultUserProfile(),
      // By id + environment only — the engine REST baseUrl is internal
      // topology the settings panel has no use for.
      availableEngines: registry.engines.map((e) => ({
        id: e.id,
        environment: environmentOf(e),
      })),
      // Toolset gate (decided up front) AND per-request identity: without a
      // profile key the save tool refuses, so the panel must render read-only
      // instead of a Save button whose click errors.
      canSave: canSave && key !== undefined,
    }
  }

  server.tool(
    {
      name: CAMUNDA7_SHOW_USER_PROFILE,
      title: "Profile & Settings",
      description:
        "Open the user profile & settings panel: language, theme, which engines are available + the default engine, and dashboard preferences. Analytics defaults live in the analytics module's own settings section (analytics_show_settings).",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({}),
      ...showToolBinding(CAMUNDA7_SHOW_USER_PROFILE, "Profile & Settings"),
    },
    withToolErrors(async (_params, ctx) => {
      const view = await loadView(ctx)
      return buildSingleWidgetView({
        widget: "camunda7:user-profile",
        app: "camunda7",
        dataType: "camunda7:userProfile",
        data: view,
        title: "Profile & Settings",
        summary: summarize(view.profile),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_USER_PROFILE_DATA,
      title: "User profile data (internal)",
      description:
        "Internal JSON feed (no UI) for the caller's user profile + the configured engine list. Prefer camunda7_show_user_profile.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({}),
      // visibility "app" + widgetAccessible: same dual app-only contract as
      // the widget-tools feeds (see `widget-tools/shared.ts`).
      ...appOnly,
    },
    // Spread: the feed contract takes `Record<string, unknown>`, which the
    // named `UserProfileView` interface doesn't structurally satisfy.
    withToolErrors(async (_params, ctx) => rawData({ ...(await loadView(ctx)) })),
  )

  if (!canSave) return

  server.tool(
    {
      name: CAMUNDA7_SAVE_USER_PROFILE,
      title: "Save user profile",
      description:
        'Update the caller\'s user profile. Only the provided fields change; omitted fields keep their value. Use this to honor requests like "switch the UI to German" (language: "de") or "only let me pick the prod engines" (allowedEngineIds). Engine availability is curation, not access control.',
      annotations: { idempotentHint: true },
      // The flat input is a tool-API convenience; the handler splits it into
      // the record's cross-module fields and this module's own slice.
      inputSchema: strictToolInput(userProfileToolSaveInput.shape),
      // No `view`/`visibility`: this is a normal model-visible tool returning
      // a text summary; the widget also calls it and reads the updated profile
      // back from structuredContent.
    },
    withToolErrors(async (params, ctx) => {
      // Keyless refusal + a patch-only slice save are the shared slice-write
      // contract (`requireProfileKey` + `saveModuleSlice` in
      // `@miragon-ai/widget-shell/server`). This tool also carries the
      // record-level language/theme, so it hands the store the same patch
      // itself: ONLY the given fields, merged by the store over the RAW
      // stored slice under its per-key lock, so a concurrent
      // `camunda7_engine` "select" is never reverted by a stale pre-read.
      const key = requireProfileKey(ctx)
      const { language, theme, ...sliceInput } = params
      const slicePatch: Record<string, unknown> = { ...sliceInput }
      // The settings UI sends an empty string for the "(auto)"/"(none)" option
      // of an optional id field. That CLEARS the stored value: an explicit
      // `undefined` overrides the stored field in the store's merge (a
      // deleted key would leave the old default in place).
      for (const field of ["defaultEngineId", "defaultDashboardId"]) {
        if (slicePatch[field] === "") slicePatch[field] = undefined
      }
      // The OAuth caller is stamped as the record's owner.
      const saved = await store.save(
        key,
        { language, theme, modules: { [CAMUNDA7_MODULE_KEY]: slicePatch } },
        { userId: resolveAuthUserId(ctx) },
      )
      const profile = toUserProfile(saved)
      return {
        content: [{ type: "text" as const, text: summarize(profile) }],
        structuredContent: profile as unknown as Record<string, unknown>,
      }
    }),
  )
}
