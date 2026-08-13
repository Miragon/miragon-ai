import type { MCPServer } from "mcp-use"
import { z } from "zod"
import {
  appOnly,
  buildDataFeedResult,
  buildSingleWidgetView,
  mergeRawSlice,
  requireProfileKey,
  showToolBinding,
  withToolErrors,
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
import { allowsDurableWrites } from "./toolsets.js"

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
   * False without a writable store, in a read-only toolset, or when the
   * request carries no resolvable profile identity (mcp-use 2 issues no MCP
   * session ids — identity comes from OAuth or a gateway-stamped
   * `Mcp-Session-Id`) — the widget hides Save.
   */
  canSave: boolean
}

export function registerSettingsTools(
  server: MCPServer,
  profileStore?: ProfileSource,
  toolset?: string,
): void {
  // The save tool is a durable write registered OUTSIDE the tool registrar, so
  // it gates itself against the deployment's toolset (see `allowsDurableWrites`
  // — declared names, unknown ones degrade to `read-only` like
  // withToolsetFilter).
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
        "Open the analytics settings section for this session: the default look-back period and the minimum comparison bucket size applied when analytics calls omit them.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({}),
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
      inputSchema: z.object({}),
      ...appOnly,
    },
    withToolErrors(async (_params, ctx) => buildDataFeedResult({ ...(await loadView(ctx)) })),
  )

  // Without a writable store (or in a read-only toolset) there is nothing to
  // save into — the section stays read-only (canSave: false) and the tool
  // surface honestly reflects that.
  if (!save || !store) return

  server.tool(
    {
      name: ANALYTICS_SAVE_SETTINGS,
      title: "Save analytics settings",
      description:
        "Update the session's analytics defaults. Only the provided fields change; omitted fields keep their value. The saved defaults apply whenever an analytics call omits `period` or `minBucketSize`.",
      annotations: { idempotentHint: true },
      inputSchema: analyticsSettingsSaveInput,
      // No view binding / app visibility: a normal model-visible tool; the
      // settings widget also calls it and reads the saved slice back from
      // structuredContent.
    },
    withToolErrors(async (params, ctx) => {
      // Keyless refusal + raw-slice merge are the shared slice-write contract
      // (`@miragon-ai/widget-shell/server`) — every module's save tool uses
      // the same pair.
      const key = requireProfileKey(ctx)
      const nextSlice = await mergeRawSlice(store, key, ANALYTICS_MODULE_KEY, params)
      // Stamping the auth user id marks the record user-bound — exempt from
      // the app's session-TTL cleanup.
      await save(
        key,
        { modules: { [ANALYTICS_MODULE_KEY]: nextSlice } },
        { userId: resolveSettingsAuthUserId(ctx) },
      )
      const effective = parseAnalyticsSettings({ [ANALYTICS_MODULE_KEY]: nextSlice })
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
