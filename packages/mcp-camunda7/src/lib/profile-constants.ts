/**
 * Enumerated profile option sets, kept in a zod-free module so widget code can
 * import the runtime arrays (for select/checkbox option lists) without pulling
 * zod into the UI bundle. `profile-schema.ts` builds its `z.enum(...)`s from
 * these, so the two never drift.
 */

/** UI + summary languages. Extend deliberately — every locale needs a catalog. */
export const LOCALES = ["en", "de"] as const
export type Locale = (typeof LOCALES)[number]

/** Theme preference; `system` follows the OS `prefers-color-scheme`. */
export const THEMES = ["light", "dark", "system"] as const
export type ThemePref = (typeof THEMES)[number]

/**
 * Preferred operations role. A profile hint only — actual tool exposure is set
 * at the MCP connection via the `camunda7:read-only|operations|admin` toolset
 * (see `lib/toolsets.ts`); without auth this never gates tools, it only curates
 * UI affordances.
 */
export const ROLES = ["read-only", "operations", "admin"] as const
export type Role = (typeof ROLES)[number]

/**
 * Bumped when the persisted profile shape changes in a migration-relevant way.
 * Every bump needs a matching entry in `PROFILE_MIGRATIONS`
 * (`profile-migrations.ts`) so older records upgrade on read instead of being
 * silently reset to defaults.
 *
 * v2: the analytics preferences moved out of the flat camunda7-owned fields
 * (`analyticsDefaultPeriod`/`analyticsMinBucketSize`) into the per-module
 * `modules.analytics` slice (`defaultPeriod`/`minBucketSize`).
 */
export const PROFILE_SCHEMA_VERSION = 2
