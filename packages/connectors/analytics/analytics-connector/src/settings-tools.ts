import type { MCPServer } from "mcp-use"
import {
  appOnly,
  buildDataFeedResult,
  buildSingleWidgetView,
  requireProfileKey,
  saveModuleSlice,
  showToolBinding,
  withToolErrors,
  strictToolInput,
} from "@miragon-ai/widget-shell/server"
import { ANALYTICS_SAVE_SETTINGS, ANALYTICS_SETTINGS_DATA } from "./tool-names.js"
import {
  localizeFor,
  resolveSettingsAuthUserId,
  resolveSettingsKey,
  type ProfileSource,
} from "./server-locale.js"
import {
  ANALYTICS_MODULE_KEY,
  analyticsSettingsSaveInput,
  parseAnalyticsSettings,
  settingsFor,
  type AnalyticsSettings,
} from "./settings.js"
import { allowsDurableWrites, type AnalyticsToolset } from "./toolsets.js"

/**
 * The analytics module's settings section — its own show/data/save tool triple
 * (the three render paths), so the module plugs into the settings page without
 * camunda7 owning any analytics vocabulary. The slice persists under
 * `modules.analytics` in the shared profile record; the shared store merges
 * per module key, so this never touches other modules' slices.
 */

/** What the settings widget renders: the effective slice + whether saving is wired. */
export interface AnalyticsSettingsView {
  settings: AnalyticsSettings
  /**
   * False without a writable store, in the `read-only` toolset (also what a
   * missing toolset resolves to), or when the request carries no caller
   * identity (no OAuth — see `resolveProfileKey`) — the widget hides Save.
   */
  canSave: boolean
}

export function registerSettingsTools(
  server: MCPServer,
  profileStore?: ProfileSource,
  toolset?: AnalyticsToolset,
): void {
  // The save tool is a durable write registered OUTSIDE the tool registrar, so
  // it gates itself against the module's toolset (see `allowsDurableWrites`):
  // only `standard` saves. A missing toolset resolves to the `read-only`
  // floor, and an unknown name from an untyped caller warns and degrades to it.
  const store = profileStore
  const save = allowsDurableWrites(toolset) ? store?.save?.bind(store) : undefined

  const loadView = async (ctx: unknown): Promise<AnalyticsSettingsView> => ({
    settings: await settingsFor(store, ctx),
    // Store/toolset gate AND per-request identity: without a profile key the
    // save tool refuses, so the section must render read-only instead of a
    // Save button whose click errors.
    canSave: Boolean(save) && resolveSettingsKey(ctx) !== undefined,
  })

  const summarize = async (ctx: unknown, view: AnalyticsSettingsView): Promise<string> => {
    const t = await localizeFor(store, ctx)
    return t("aSum.settings", {
      period: view.settings.defaultPeriod,
      minBucketSize: view.settings.minBucketSize,
      changeHint: view.canSave ? t("aSum.settingsChangeHint") : "",
    })
  }

  server.tool(
    {
      name: "analytics_show_settings",
      title: "Analytics Settings",
      description:
        "Open the analytics settings section: the default look-back period and the minimum comparison bucket size applied when analytics calls omit them.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({}),
      ...showToolBinding("analytics_show_settings", "Analytics Settings"),
    },
    withToolErrors(async (_params, ctx) => {
      const view = await loadView(ctx)
      return buildSingleWidgetView({
        widget: "analytics:settings",
        app: "analytics",
        dataType: "analytics:settings",
        data: { ...view },
        title: "Analytics Settings",
        summary: await summarize(ctx, view),
      })
    }),
  )

  server.tool(
    {
      name: ANALYTICS_SETTINGS_DATA,
      title: "Analytics settings data (internal)",
      description:
        "Internal JSON feed (no UI) for the analytics settings section's self-fetch. Prefer analytics_show_settings.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({}),
      ...appOnly,
    },
    withToolErrors(async (_params, ctx) => buildDataFeedResult({ ...(await loadView(ctx)) })),
  )

  // Without a writable store (or on the `read-only` floor) there is nothing to
  // save into — the section stays read-only (canSave: false) and the tool
  // surface honestly reflects that.
  if (!save || !store) return

  server.tool(
    {
      name: ANALYTICS_SAVE_SETTINGS,
      title: "Save analytics settings",
      description:
        "Update the caller's analytics defaults. Only the provided fields change; omitted fields keep their value. The saved defaults apply whenever an analytics call omits `period` or `minBucketSize`.",
      // The module's only non-read-only tool, and explicitly NOT destructive
      // (MCP presumes a write destructive unless told otherwise): it merges
      // the caller's own slice, nothing is deleted or overwritten wholesale.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      inputSchema: strictToolInput(analyticsSettingsSaveInput.shape),
      // No view binding / app visibility: a normal model-visible tool; the
      // settings widget also calls it and reads the saved slice back from
      // structuredContent.
    },
    withToolErrors(async (params, ctx) => {
      // Keyless refusal + a patch-only slice save are the shared slice-write
      // contract (`@miragon-ai/widget-shell/server`) — every module's save
      // tool uses the same pair. The store merges the patch under its per-key
      // lock, so a concurrent save of the other field is never reverted.
      const key = requireProfileKey(ctx)
      // The OAuth caller is stamped as the record's owner.
      const savedSlice = await saveModuleSlice(
        { get: (k) => store.get(k), save },
        key,
        ANALYTICS_MODULE_KEY,
        params,
        { userId: resolveSettingsAuthUserId(ctx) },
      )
      const effective = parseAnalyticsSettings({ [ANALYTICS_MODULE_KEY]: savedSlice })
      const t = await localizeFor(store, ctx)
      return {
        content: [
          {
            type: "text" as const,
            text: t("aSum.settingsSaved", {
              period: effective.defaultPeriod,
              minBucketSize: effective.minBucketSize,
            }),
          },
        ],
        structuredContent: effective as unknown as Record<string, unknown>,
      }
    }),
  )
}
