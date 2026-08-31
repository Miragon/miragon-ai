import { z } from "zod"
import {
  LOCALES,
  parseModuleSlice,
  THEMES,
  withoutDefaults,
  type Locale,
  type ProfileRecord,
  type ThemePref,
} from "@miragon-ai/widget-shell/server"
import { ROLES } from "./profile-constants.js"

/** Slice key under `profile.modules.<module>` — this module's name. */
export const CAMUNDA7_MODULE_KEY = "camunda7"

/**
 * The camunda7-owned slice of the shared profile record
 * (`profile.modules.camunda7`) — everything this connector persists per user.
 * The cross-module preferences (`language`, `theme`) live on the record itself
 * (`profileRecordSchema` in `@miragon-ai/widget-shell/server`); this module
 * validates its slice fail-soft on read and writes it through its own save
 * tool, mirroring analytics' settings slice.
 */
export const camunda7SettingsSchema = z.object({
  defaultEngineId: z
    .string()
    .optional()
    .describe(
      'Default engine: operations tools route here when no per-call `engine` override is given, and the cockpit lands on it. Saved via the settings page or `camunda7_engine` action "select".',
    ),
  allowedEngineIds: z
    .array(z.string())
    .optional()
    .describe(
      "Engine ids the user may pick from. Omitted or empty = all configured engines. Curation, not a security boundary — an explicit per-call `engine` override still reaches any configured engine.",
    ),
  pinnedDashboardIds: z
    .array(z.string())
    .default([])
    .describe("Saved-dashboard ids the user pinned, shown first in dashboard pickers."),
  defaultDashboardId: z
    .string()
    .optional()
    .describe(
      "Saved-dashboard id suggested as the user's default — surfaced to the model (open via load-dashboard) and to pickers; the cockpit has no dashboards surface yet.",
    ),
  preferredRole: z
    .enum(ROLES)
    .optional()
    .describe(
      "Preferred operations role (UI hint only; tool exposure is set by the connection toolset).",
    ),
})

export type Camunda7Settings = z.infer<typeof camunda7SettingsSchema>

/**
 * Fail-soft slice parse: absent slice, garbage, or fields a different build
 * wrote all degrade to the schema defaults — per FIELD, via the shared
 * `parseModuleSlice`, so one bad value (e.g. a `preferredRole` a newer build
 * wrote) can't reset the engine curation next to it. Same contract as
 * analytics' `parseAnalyticsSettings`.
 */
export function parseCamunda7Settings(
  record: { modules?: Record<string, unknown> } | undefined,
): Camunda7Settings {
  return parseModuleSlice(camunda7SettingsSchema, record?.modules?.[CAMUNDA7_MODULE_KEY])
}

/**
 * The flat profile VIEW this module's settings panel and summaries work with:
 * the record's cross-module preferences merged with the parsed camunda7 slice.
 * A read-side projection only — the STORED shape is the widget-shell
 * `ProfileRecord` with the engine/dashboard fields inside `modules.camunda7`.
 */
export interface UserProfile extends Camunda7Settings {
  language: Locale
  theme: ThemePref
  /** Record stamp — the widget's baseline-resync key after a save. */
  updatedAt: string
}

export function toUserProfile(record: ProfileRecord): UserProfile {
  return {
    language: record.language,
    theme: record.theme,
    updatedAt: record.updatedAt,
    ...parseCamunda7Settings(record),
  }
}

/** A fully-defaulted profile view for a key that has never been saved. */
export function defaultUserProfile(): UserProfile {
  return {
    language: "en",
    theme: "system",
    updatedAt: new Date().toISOString(),
    ...camunda7SettingsSchema.parse({}),
  }
}

/**
 * The `camunda7_save_user_profile` tool's input: any subset of the flat
 * preferences (cross-module `language`/`theme` + this module's slice fields).
 * Default-FREE on purpose — zod 4 re-applies `.default()`s through
 * `.partial()`, materializing omitted fields into silent resets (see
 * `withoutDefaults` in `@miragon-ai/widget-shell/server`). Deliberately
 * WITHOUT a `modules` passthrough: foreign module slices are written through
 * their owning module's save tool.
 */
export const userProfileToolSaveInput = z
  .object({
    language: z
      .enum(LOCALES)
      .describe(
        "UI + summary language. Also steers the language of tool summaries returned to the model.",
      ),
    theme: z.enum(THEMES).describe('Theme preference: "light", "dark" or "system".'),
    ...withoutDefaults(camunda7SettingsSchema.shape),
  })
  .partial()

/**
 * Composite payload the `show_user_profile` widget tool + `user_profile_data`
 * feed return: the profile itself plus the *full* configured engine list (so
 * the settings UI can offer every engine as an availability checkbox — it can't
 * re-source that from `camunda7_engine` "list", which is already filtered by
 * `allowedEngineIds`).
 */
export interface UserProfileView {
  profile: UserProfile
  availableEngines: Array<{ id: string; baseUrl: string; environment: string }>
  /**
   * False when the deployment's toolset drops `camunda7_save_user_profile`
   * (`camunda7:read-only`) — the panel then renders disabled fields without a
   * Save button, so the UI matches the tool surface instead of offering a
   * write that resolves to an unknown tool.
   */
  canSave: boolean
}
