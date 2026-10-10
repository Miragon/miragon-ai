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
 * (`profile-migrations.ts`) so stored records upgrade on read instead of
 * losing their preferences.
 *
 * v3 is the migration baseline (`PROFILE_MIGRATION_BASELINE`): a
 * connector-free record — language, theme, `modules.<module>` slices +
 * metadata — owned by this core package.
 */
export const PROFILE_SCHEMA_VERSION = 3
