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

/** Default analytics look-back windows offered in the profile. */
export const ANALYTICS_PERIODS = ["1d", "3d", "7d", "14d", "30d"] as const
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]

/**
 * Preferred operations role. A profile hint only — actual tool exposure is set
 * at the MCP connection via the `camunda7:read-only|operations|admin` toolset
 * (see `lib/toolsets.ts`); without auth this never gates tools, it only curates
 * UI affordances.
 */
export const ROLES = ["read-only", "operations", "admin"] as const
export type Role = (typeof ROLES)[number]

/** Bumped when the persisted profile shape changes in a migration-relevant way. */
export const PROFILE_SCHEMA_VERSION = 1
