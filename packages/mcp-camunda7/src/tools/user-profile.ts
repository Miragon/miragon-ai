import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { APP_ONLY_META, uiMeta as buildUiMeta } from "@miragon/mcp-toolkit-core"
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
  userProfileSaveInput,
  type UserProfile,
  type UserProfileView,
} from "../lib/profile-schema.js"
import type { ProfileStore } from "../lib/profile-store.js"
import { resolveProfileKey } from "../lib/resolve-profile-key.js"
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
  return translator(p.language, "profile.summary", {
    language: p.language,
    theme: p.theme,
    engines,
    period: p.analyticsDefaultPeriod,
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
 * present in `operations`/`admin`. The two view tools are always registered.
 */
export function registerUserProfileTools(
  server: MCPServer,
  store: ProfileStore,
  registry: EngineRegistry,
  resourceUri: string,
  toolset?: string,
): void {
  const uiMeta = buildUiMeta({ resourceUri })

  const loadView = async (ctx: unknown): Promise<UserProfileView> => {
    const key = resolveProfileKey(ctx)
    const profile =
      (key ? await store.get(key) : undefined) ?? defaultUserProfile(key ?? "anonymous")
    return {
      profile,
      availableEngines: registry.engines.map((e) => ({ id: e.id, baseUrl: e.baseUrl })),
    }
  }

  server.tool(
    {
      name: CAMUNDA7_SHOW_USER_PROFILE,
      title: "Profile & Settings",
      description:
        "Open the user profile & settings panel for this MiragonAI session: language, theme, which engines are available + the default engine, dashboard preferences, and analytics defaults.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({}),
      _meta: uiMeta,
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
      schema: z.object({}),
      _meta: APP_ONLY_META,
    },
    // Spread: the feed contract takes `Record<string, unknown>`, which the
    // named `UserProfileView` interface doesn't structurally satisfy.
    withToolErrors(async (_params, ctx) => rawData({ ...(await loadView(ctx)) })),
  )

  // Same rule as `withToolsetFilter`: unknown toolset names fail open.
  const saveAnnotations = { idempotentHint: true }
  if (
    toolset !== undefined &&
    isCamunda7Toolset(toolset) &&
    !isToolInToolset({ name: CAMUNDA7_SAVE_USER_PROFILE, annotations: saveAnnotations }, toolset)
  ) {
    return
  }

  server.tool(
    {
      name: CAMUNDA7_SAVE_USER_PROFILE,
      title: "Save user profile",
      description:
        'Update the current session\'s user profile. Only the provided fields change; omitted fields keep their value. Use this to honor requests like "switch the UI to German" (language: "de") or "only let me pick the prod engines" (allowedEngineIds). Engine availability is curation, not access control.',
      annotations: saveAnnotations,
      schema: userProfileSaveInput,
      // No `_meta.ui`: this is a normal model-visible tool returning a text
      // summary; the widget also calls it and reads the updated profile back
      // from structuredContent.
    },
    withToolErrors(async (params, ctx) => {
      const key = resolveProfileKey(ctx) ?? "anonymous"
      const saved = await store.save(key, params)
      return {
        content: [{ type: "text" as const, text: summarize(saved) }],
        structuredContent: saved as unknown as Record<string, unknown>,
      }
    }),
  )
}
