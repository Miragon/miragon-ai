import { z } from "zod"
import {
  LANGUAGES,
  parseModuleSlice,
  withoutDefaults,
  type LanguagePref,
  type ProfileRecord,
} from "@miragon-ai/widget-shell/server"

/** Slice key under `profile.modules.<module>` — this module's name. */
export const CAMUNDA7_MODULE_KEY = "camunda7"

/**
 * The camunda7-owned slice of the shared profile record
 * (`profile.modules.camunda7`) — everything this connector persists per user.
 * The cross-module preference (`language`) lives on the record itself
 * (`profileRecordSchema` in `@miragon-ai/widget-shell/server`); this module
 * validates its slice fail-soft on read and writes it through its own save
 * tool, mirroring analytics' settings slice.
 */
export const camunda7SettingsSchema = z.object({
  defaultEngineId: z
    .string()
    .optional()
    .describe(
      "Default engine: operations tools route here when no per-call `engine` override is given, and the cockpit lands on it. Saved via the settings page or camunda7_select_engine.",
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
})

export type Camunda7Settings = z.infer<typeof camunda7SettingsSchema>

/**
 * Fail-soft slice parse: absent slice, garbage, or fields a different build
 * wrote all degrade to the schema defaults — per FIELD, via the shared
 * `parseModuleSlice`, so one bad value (e.g. an `allowedEngineIds` a newer
 * build wrote in another shape) can't reset the default engine next to it.
 * A key this build no longer reads (the retired `preferredRole`, #322 U25)
 * stays in the stored document untouched, inert. Same contract as
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
  language: LanguagePref
  /** Record stamp — the widget's baseline-resync key after a save. */
  updatedAt: string
}

export function toUserProfile(record: ProfileRecord): UserProfile {
  return {
    language: record.language,
    updatedAt: record.updatedAt,
    ...parseCamunda7Settings(record),
  }
}

/** A fully-defaulted profile view for a key that has never been saved. */
export function defaultUserProfile(): UserProfile {
  return {
    language: "system",
    updatedAt: new Date().toISOString(),
    ...camunda7SettingsSchema.parse({}),
  }
}

/**
 * The `camunda7_save_user_profile` tool's input: any subset of the flat
 * preferences (the cross-module `language` + this module's slice fields).
 * There is no theme: the widgets follow the host's theme.
 * Default-FREE on purpose — zod 4 re-applies `.default()`s through
 * `.partial()`, materializing omitted fields into silent resets (see
 * `withoutDefaults` in `@miragon-ai/widget-shell/server`). Deliberately
 * WITHOUT a `modules` passthrough: foreign module slices are written through
 * their owning module's save tool.
 */
export const userProfileToolSaveInput = z
  .object({
    language: z
      .enum(LANGUAGES)
      .describe('UI + summary language; "system" follows the chat host (summaries in English).'),
    ...withoutDefaults(camunda7SettingsSchema.shape),
  })
  .partial()

/**
 * Composite payload the `show_user_profile` widget tool + `user_profile_data`
 * feed return: the profile itself plus the *full* configured engine list (so
 * the settings UI can offer every engine as an availability checkbox — it can't
 * re-source that from `camunda7_list_engines`, which is already filtered by
 * `allowedEngineIds`).
 */
export interface UserProfileView {
  profile: UserProfile
  availableEngines: Array<{ id: string; environment: string }>
  /**
   * False when the deployment's toolset drops `camunda7_save_user_profile`
   * (`camunda7:read-only`) — the panel then renders disabled fields without a
   * Save button, so the UI matches the tool surface instead of offering a
   * write that resolves to an unknown tool.
   */
  canSave: boolean
  /**
   * Why the panel is read-only, so it can name the way out (#322 U25), the
   * missing sign-in first: `noSignIn` — the request names no user to save for
   * (a connection without OAuth, the default deployment): only a deployment
   * with sign-in can save, whatever its toolset; `toolset` — a signed-in
   * user on a connection without profile writes (a toolset like `operations`
   * has them). Null when `canSave`.
   */
  readOnlyReason: ProfileReadOnlyReason | null
}

/** Why a settings panel cannot save — see {@link UserProfileView.readOnlyReason}. */
export type ProfileReadOnlyReason = "noSignIn" | "toolset"
