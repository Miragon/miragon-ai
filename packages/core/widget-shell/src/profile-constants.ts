/**
 * Enumerated profile option sets, kept in a zod-free module so widget code can
 * import the runtime arrays (for select/checkbox option lists) without pulling
 * zod into the UI bundle. `profile-record.ts` builds its `z.enum(...)`s from
 * these, so the two never drift. Exported from BOTH `/server` and `/widgets`.
 */

/** UI + summary languages. Extend deliberately — every locale needs a catalog. */
export const LOCALES = ["en", "de"] as const
export type Locale = (typeof LOCALES)[number]

/**
 * Language preference: an explicit locale, or `system` — follow the host's
 * locale (`hostContext.locale`, normalized to a supported language), then
 * English. Server-side summaries have no host locale, so `system` reads as
 * English there (`explicitLocale(...) ?? "en"`).
 */
export const LANGUAGES = ["system", ...LOCALES] as const
export type LanguagePref = (typeof LANGUAGES)[number]

/**
 * The supported locale a language preference names explicitly — `undefined`
 * for `system`, a missing value, or anything this build ships no catalog for.
 * Loose input on purpose: profile feeds arrive untyped.
 */
export function explicitLocale(language: string | undefined): Locale | undefined {
  return LOCALES.find((locale) => locale === language)
}

/**
 * Bumped when the persisted profile shape changes in a migration-relevant way.
 * Every bump needs a matching entry in `PROFILE_MIGRATIONS`
 * (`profile-migrations.ts`) so stored records upgrade on read instead of
 * losing their preferences.
 *
 * v3 is the migration baseline (`PROFILE_MIGRATION_BASELINE`): a
 * connector-free record — language, `modules.<module>` slices + metadata —
 * owned by this core package. The theme preference it once carried is gone
 * (widgets follow the host's theme); a stored `theme` key stays inert in the
 * raw document, so it needed no migration.
 */
export const PROFILE_SCHEMA_VERSION = 3
