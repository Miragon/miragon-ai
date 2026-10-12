import { z } from "zod"
import {
  parseModuleSlice,
  withoutDefaults,
  type ProfileRecord,
} from "@miragon-ai/widget-shell/server"

/** Slice key under `profile.modules.<module>` — this module's name. */
export const CAMUNDA7_MODULE_KEY = "camunda7"

/**
 * The camunda7-owned slice of the shared profile record
 * (`profile.modules.camunda7`) — everything this connector persists per user.
 * The cross-module preference (`language`) lives on the record itself and
 * belongs to the shell (`shell_save_settings`, `@miragon-ai/widget-shell`);
 * this module validates its slice fail-soft on read and writes it through
 * its own save tool, mirroring analytics' settings slice.
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
 * The VIEW this module's settings section and summaries work with: the parsed
 * camunda7 slice plus the record's stamp. A read-side projection only — the
 * STORED shape is the widget-shell `ProfileRecord` with these fields inside
 * `modules.camunda7`.
 */
export interface UserProfile extends Camunda7Settings {
  /** Record stamp — the widget's baseline-resync key after a save. */
  updatedAt: string
}

export function toUserProfile(record: ProfileRecord): UserProfile {
  return { updatedAt: record.updatedAt, ...parseCamunda7Settings(record) }
}

/** A fully-defaulted view for a key that has never been saved. */
export function defaultUserProfile(): UserProfile {
  return { updatedAt: new Date().toISOString(), ...camunda7SettingsSchema.parse({}) }
}

/**
 * The `camunda7_save_settings` tool's input: any subset of this module's
 * slice fields (the UI language is the shell's, `shell_save_settings`).
 * Default-FREE on purpose — zod 4 re-applies `.default()`s through
 * `.partial()`, materializing omitted fields into silent resets (see
 * `withoutDefaults` in `@miragon-ai/widget-shell/server`). Deliberately
 * WITHOUT a `modules` passthrough: foreign module slices are written through
 * their owning module's save tool.
 */
export const userProfileToolSaveInput = z
  .object(withoutDefaults(camunda7SettingsSchema.shape))
  .partial()

/**
 * Composite payload `camunda7_show_settings` + `camunda7_settings_data`
 * return: the settings plus the *full* configured engine list (so the
 * section can offer every engine as an availability checkbox — it can't
 * re-source that from `camunda7_list_engines`, which is already filtered by
 * `allowedEngineIds`).
 */
export interface UserProfileView {
  profile: UserProfile
  availableEngines: Array<{ id: string; environment: string }>
  /**
   * False when the deployment's toolset drops `camunda7_save_settings`
   * (`camunda7:read-only`) — the section then renders disabled fields without a
   * Save button, so the UI matches the tool surface instead of offering a
   * write that resolves to an unknown tool.
   */
  canSave: boolean
  /**
   * Why the section is read-only, so it can name the way out (#322 U25), the
   * missing sign-in first: `noSignIn` — the request names no user to save for
   * (a connection without OAuth, the default deployment): only a deployment
   * with sign-in can save, whatever its toolset; `toolset` — a signed-in
   * user on a connection without profile writes (a toolset like `operations`
   * has them). Null when `canSave`.
   */
  readOnlyReason: ProfileReadOnlyReason | null
}

/** Why the settings section cannot save — see {@link UserProfileView.readOnlyReason}. */
export type ProfileReadOnlyReason = "noSignIn" | "toolset"
