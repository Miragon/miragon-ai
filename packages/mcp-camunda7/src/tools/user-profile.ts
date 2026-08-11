import { z } from "zod"
import type { MCPServer } from "mcp-use"
import {
  buildDataFeedResult as rawData,
  buildSingleWidgetView,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import { isCamunda7Toolset, isToolInToolset } from "../lib/toolsets.js"
import {
  CAMUNDA7_SAVE_USER_PROFILE,
  CAMUNDA7_SHOW_USER_PROFILE,
  CAMUNDA7_USER_PROFILE_DATA,
} from "../tool-names.js"
import {
  defaultUserProfile,
  userProfileToolSaveInput,
  type UserProfile,
  type UserProfileView,
} from "../lib/profile-schema.js"
import type { ProfileStore } from "../lib/profile-store.js"
import {
  ANONYMOUS_PROFILE_KEY,
  resolveAuthUserId,
  resolveProfileKey,
} from "../lib/resolve-profile-key.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { appOnly, showToolBinding } from "../widget-tools/shared.js"
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
 * All three resolve the profile key from the request (auth user id → session id)
 * and never talk to an engine; the engine *registry* is read only for the full
 * configured engine list the settings UI offers as availability checkboxes.
 *
 * The save tool is a durable write (file-backed profile store), so it honors
 * the deployment's toolset like every registrar write: absent in `read-only`,
 * present in `operations`/`admin`. The two view tools are always registered and
 * carry the decision as `canSave`, so the panel's Save button and the tool
 * surface can never disagree (mirrors analytics' `registerSettingsTools`).
 */
export function registerUserProfileTools(
  server: MCPServer,
  store: ProfileStore,
  registry: EngineRegistry,
  toolset?: string,
): void {
  // The save tool is a durable write registered OUTSIDE the registrar, so it
  // gates itself — same rule as `withToolsetFilter`: unknown toolset names fail
  // open. Decided up front because the two view tools report the outcome as
  // `canSave`, which is what hides the panel's Save button; a view that claimed
  // otherwise would offer a write that resolves to an unknown tool.
  const saveAnnotations = { idempotentHint: true }
  const canSave =
    toolset === undefined ||
    !isCamunda7Toolset(toolset) ||
    isToolInToolset({ name: CAMUNDA7_SAVE_USER_PROFILE, annotations: saveAnnotations }, toolset)

  const loadView = async (ctx: unknown): Promise<UserProfileView> => {
    // Same key precedence as the save path (resolveProfileKey maps stdio to
    // the shared anonymous record), so a keyless save is read back instead of
    // being write-only. An HTTP request without any identity resolves no key —
    // that renders defaults, and since mcp-use 2 issues no MCP session ids it
    // is the NORM for un-authenticated HTTP deployments (identity comes from
    // OAuth or a gateway-stamped Mcp-Session-Id).
    const key = resolveProfileKey(ctx)
    const profile =
      (key ? await store.get(key) : undefined) ?? defaultUserProfile(key ?? ANONYMOUS_PROFILE_KEY)
    return {
      profile,
      availableEngines: registry.engines.map((e) => ({ id: e.id, baseUrl: e.baseUrl })),
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
        "Open the user profile & settings panel for this MiragonAI session: language, theme, which engines are available + the default engine, and dashboard preferences. Analytics defaults live in the analytics module's own settings section (analytics_show_settings).",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({}),
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
        "Internal JSON feed (no UI) for the current session's user profile + the configured engine list. Prefer camunda7_show_user_profile.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({}),
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
        'Update the current session\'s user profile. Only the provided fields change; omitted fields keep their value. Use this to honor requests like "switch the UI to German" (language: "de") or "only let me pick the prod engines" (allowedEngineIds). Engine availability is curation, not access control.',
      annotations: saveAnnotations,
      // Deliberately WITHOUT `modules`: foreign module slices are written
      // through their owning module's save tool (e.g. analytics_save_settings).
      inputSchema: userProfileToolSaveInput,
      // No `view`/`visibility`: this is a normal model-visible tool returning
      // a text summary; the widget also calls it and reads the updated profile
      // back from structuredContent.
    },
    withToolErrors(async (params, ctx) => {
      const key = resolveProfileKey(ctx)
      if (!key) {
        // HTTP request without any identity: refuse instead of silently
        // writing into a record shared across unrelated keyless clients.
        throw new Error(
          "No caller identity to save the profile under (mcp-use 2 issues no MCP session ids) — configure MCP_OAUTH so settings persist per user.",
        )
      }
      // Stamping the auth user id marks the record user-bound — exempt from
      // the session-TTL cleanup.
      const saved = await store.save(key, params, { userId: resolveAuthUserId(ctx) })
      return {
        content: [{ type: "text" as const, text: summarize(saved) }],
        structuredContent: saved as unknown as Record<string, unknown>,
      }
    }),
  )
}
