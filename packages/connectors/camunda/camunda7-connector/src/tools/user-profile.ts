import type { MCPServer } from "mcp-use"
import {
  appOnly,
  buildDataFeedResult as rawData,
  buildSingleWidgetView,
  explicitLocale,
  requireProfileKey,
  type LanguagePref,
  showToolBinding,
  withToolErrors,
  type ProfileStore,
  strictToolInput,
} from "@miragon/pulse-widget-shell/server"
import { allowsProfileSave, type Camunda7Toolset } from "../lib/toolsets.js"
import {
  CAMUNDA7_SAVE_SETTINGS,
  CAMUNDA7_SHOW_SETTINGS,
  CAMUNDA7_SETTINGS_DATA,
} from "../tool-names.js"
import {
  CAMUNDA7_MODULE_KEY,
  defaultUserProfile,
  toUserProfile,
  userProfileToolSaveInput,
  type ProfileReadOnlyReason,
  type UserProfile,
  type UserProfileView,
} from "../lib/profile-schema.js"
import { resolveAuthUserId, resolveProfileKey } from "../lib/resolve-profile-key.js"
import { environmentOf } from "../lib/environments.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { translator } from "../messages/index.js"
import { viewLocaleOf } from "../lib/server-locale.js"

/**
 * One-line, model-facing summary of the settings — localized to the record's
 * language (steers the model toward responding in that language; the MCP
 * server cannot force the model's output language). `system` follows the
 * host's locale, a widget-side signal the server never sees — English here.
 */
function summarize(p: UserProfile, language: LanguagePref): string {
  const locale = explicitLocale(language) ?? "en"
  const engines =
    p.allowedEngineIds && p.allowedEngineIds.length > 0
      ? translator(locale, "profile.summary.someEngines", { count: p.allowedEngineIds.length })
      : translator(locale, "profile.summary.allEngines")
  const defaultDashboard = p.defaultDashboardId
    ? translator(locale, "profile.summary.defaultDashboard", { id: p.defaultDashboardId })
    : ""
  return translator(locale, "profile.summary", { engines, defaultDashboard })
}

/**
 * Which of the two gates keeps the section read-only, so it can name the way
 * out — the missing sign-in FIRST: a request without a profile key (HTTP
 * without OAuth, the default deployment) cannot save on any toolset, so
 * "switch to operations" would send the operator to a second read-only
 * section. The toolset is the reason only for a caller who could save.
 */
function readOnlyReason(
  toolsetAllowsSave: boolean,
  key: string | undefined,
): ProfileReadOnlyReason | null {
  if (key === undefined) return "noSignIn"
  return toolsetAllowsSave ? null : "toolset"
}

/**
 * Registers camunda7's settings section, a `<module>:settings` section of the
 * shell's settings page like analytics' (the three render paths, per the
 * CLAUDE.md invariant):
 *   - `camunda7_show_settings`  — widget tool (renders the section),
 *   - `camunda7_settings_data`  — app-only feed (backs the widget self-fetch),
 *   - `camunda7_save_settings`  — model-visible write (partial update).
 * The UI language is the shell's (`shell_save_settings`), not this module's.
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
  // rule, via the one profile-write decision `camunda7_select_engine`
  // shares. Decided up front because the two view tools report the outcome as
  // `canSave`, which is what hides the section's Save button; a view that
  // claimed otherwise would offer a write that resolves to an unknown tool.
  const canSave = allowsProfileSave(toolset)

  const loadView = async (
    ctx: unknown,
  ): Promise<{ view: UserProfileView; language: LanguagePref }> => {
    // Same key resolution as the save path, so a save is always read back. A
    // request without OAuth resolves no key and renders the defaults — the
    // NORM on an unauthenticated deployment. The record's language words the
    // summary and the title; it is not part of the view.
    const key = resolveProfileKey(ctx)
    const record = key ? await store.get(key) : undefined
    const view: UserProfileView = {
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
      readOnlyReason: readOnlyReason(canSave, key),
    }
    return { view, language: record?.language ?? "system" }
  }

  server.tool(
    {
      name: CAMUNDA7_SHOW_SETTINGS,
      title: "Engine & dashboard settings",
      description:
        "Open camunda7's settings: available engines, the default engine, dashboard preferences.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({}),
      ...showToolBinding(CAMUNDA7_SHOW_SETTINGS, "Engine & dashboard settings"),
    },
    withToolErrors(async (_params, ctx) => {
      const { view, language } = await loadView(ctx)
      // Titled only in a language the profile names; "system" sets none, so
      // no English toolbar title sits over a German section (#322 U3).
      const { title } = viewLocaleOf(language)
      return buildSingleWidgetView({
        widget: "camunda7:settings",
        app: "camunda7",
        dataType: "camunda7:settings",
        data: view,
        title: title("viewTitle.settings"),
        summary: summarize(view.profile, language),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SETTINGS_DATA,
      title: "Settings data (internal)",
      description:
        "Internal JSON feed (no UI) for the caller's camunda7 settings + the configured engine list. Prefer camunda7_show_settings.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({}),
      // visibility "app" + widgetAccessible: same dual app-only contract as
      // the widget-tools feeds (see `widget-tools/shared.ts`).
      ...appOnly,
    },
    // Spread: the feed contract takes `Record<string, unknown>`, which the
    // named `UserProfileView` interface doesn't structurally satisfy.
    withToolErrors(async (_params, ctx) => rawData({ ...(await loadView(ctx)).view })),
  )

  if (!canSave) return

  server.tool(
    {
      name: CAMUNDA7_SAVE_SETTINGS,
      title: "Save engine & dashboard settings",
      description:
        'Update the caller\'s camunda7 settings. Only the provided fields change; omitted fields keep their value. Use it for requests like "only let me pick the prod engines" (allowedEngineIds) or a default dashboard. Engine availability is curation, not access control.',
      // A local profile write: explicitly non-destructive (MCP presumes a
      // write destructive unless told otherwise) and closed-world.
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
      // `@miragon/pulse-widget-shell/server`). The store is called directly for
      // the record it returns (its `updatedAt` re-syncs the section's form),
      // with the same patch: ONLY the given fields, merged by the store over
      // the RAW stored slice under its per-key lock, so a concurrent
      // `camunda7_select_engine` is never reverted by a stale pre-read.
      const key = requireProfileKey(ctx)
      const slicePatch: Record<string, unknown> = { ...params }
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
        { modules: { [CAMUNDA7_MODULE_KEY]: slicePatch } },
        { userId: resolveAuthUserId(ctx) },
      )
      const profile = toUserProfile(saved)
      return {
        content: [{ type: "text" as const, text: summarize(profile, saved.language) }],
        structuredContent: profile as unknown as Record<string, unknown>,
      }
    }),
  )
}
