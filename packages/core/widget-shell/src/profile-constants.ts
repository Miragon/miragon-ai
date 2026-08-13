/**
 * Enumerated profile option sets, kept in a zod-free module so widget code can
 * import the runtime arrays (for select/checkbox option lists) without pulling
 * zod into the UI bundle. `profile-record.ts` builds its `z.enum(...)`s from
 * these, so the two never drift. Exported from BOTH `/server` and `/widgets`.
 */

/** UI + summary languages. Extend deliberately — every locale needs a catalog. */
export const LOCALES = ["en", "de"] as const
export type Locale = (typeof LOCALES)[number]

/** Theme preference; `system` follows the OS `prefers-color-scheme`. */
export const THEMES = ["light", "dark", "system"] as const
export type ThemePref = (typeof THEMES)[number]

/**
 * Bumped when the persisted profile shape changes in a migration-relevant way.
 * Every bump needs a matching entry in `PROFILE_MIGRATIONS`
 * (`profile-migrations.ts`) so older records upgrade on read instead of being
 * silently reset to defaults.
 *
 * v2: the analytics preferences moved out of the flat camunda7-owned fields
 * (`analyticsDefaultPeriod`/`analyticsMinBucketSize`) into the per-module
 * `modules.analytics` slice (`defaultPeriod`/`minBucketSize`).
 *
 * v3: the camunda7 engine/dashboard preferences (`defaultEngineId`,
 * `allowedEngineIds`, `pinnedDashboardIds`, `defaultDashboardId`,
 * `preferredRole`) moved into the `modules.camunda7` slice — since then the
 * record itself is connector-free (language, theme, modules + metadata) and
 * owned by this core package.
 */
export const PROFILE_SCHEMA_VERSION = 3
