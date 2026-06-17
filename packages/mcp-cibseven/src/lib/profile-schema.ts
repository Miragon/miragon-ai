import { z } from "zod"
import {
  ANALYTICS_PERIODS,
  LOCALES,
  PROFILE_SCHEMA_VERSION,
  ROLES,
  THEMES,
} from "./profile-constants.js"

/**
 * User-settable preferences — everything a person can change about their
 * MiragonAI session. Identity (`id`/`userId`) and server-managed metadata
 * (`createdAt`/`updatedAt`/`schemaVersion`) live on {@link userProfileSchema},
 * not here, so the save tool and the widget form share exactly this shape.
 *
 * Every field has a default, so a brand-new key (never saved) still yields a
 * complete, renderable profile via {@link defaultUserProfile}.
 */
export const userProfilePreferencesSchema = z.object({
  language: z
    .enum(LOCALES)
    .default("en")
    .describe(
      "UI + summary language. Also steers the language of tool summaries returned to the model.",
    ),
  theme: z
    .enum(THEMES)
    .default("system")
    .describe('Theme preference: "light", "dark" or "system".'),
  defaultEngineId: z
    .string()
    .optional()
    .describe("Engine the cockpit opens on when none is sticky-selected yet."),
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
    .describe("Saved-dashboard id the cockpit lands on when opened."),
  analyticsDefaultPeriod: z
    .enum(ANALYTICS_PERIODS)
    .default("7d")
    .describe("Default look-back window for analytics tools/widgets."),
  analyticsMinBucketSize: z
    .number()
    .int()
    .min(1)
    .default(10)
    .describe("Default minimum activity-bucket size for analytics aggregation."),
  preferredRole: z
    .enum(ROLES)
    .optional()
    .describe(
      "Preferred operations role (UI hint only; tool exposure is set by the connection toolset).",
    ),
})

export type UserProfilePreferences = z.infer<typeof userProfilePreferencesSchema>

/**
 * The persisted profile record: the preferences plus identity and
 * server-managed metadata. `id` is the profile key (the MCP session id today,
 * an authenticated user id once auth lands — see {@link resolveProfileKey}).
 */
export const userProfileSchema = userProfilePreferencesSchema.extend({
  id: z.string(),
  userId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION).default(PROFILE_SCHEMA_VERSION),
})

export type UserProfile = z.infer<typeof userProfileSchema>

/**
 * Save input: any subset of the preferences. Omitted fields keep their current
 * value (the store merges over the existing record), so the model can do a
 * single-field update ("switch the UI to German") without resending everything.
 */
export const userProfileSaveInput = userProfilePreferencesSchema.partial()
export type UserProfileSaveInput = z.infer<typeof userProfileSaveInput>

/**
 * Composite payload the `show_user_profile` widget tool + `user_profile_data`
 * feed return: the profile itself plus the *full* configured engine list (so
 * the settings UI can offer every engine as an availability checkbox — it can't
 * re-source that from `camunda7_engine` "list", which is already filtered by
 * `allowedEngineIds`).
 */
export interface UserProfileView {
  profile: UserProfile
  availableEngines: Array<{ id: string; baseUrl: string }>
}

/** A fully-defaulted profile for a key that has never been saved. */
export function defaultUserProfile(key: string): UserProfile {
  const prefs = userProfilePreferencesSchema.parse({})
  const now = new Date().toISOString()
  return {
    ...prefs,
    id: key,
    userId: undefined,
    createdAt: now,
    updatedAt: now,
    schemaVersion: PROFILE_SCHEMA_VERSION,
  }
}
