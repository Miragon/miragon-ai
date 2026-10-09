import { z } from "zod"
import {
  LOCALES,
  PROFILE_SCHEMA_VERSION,
  THEMES,
  type Locale,
  type ThemePref,
} from "./profile-constants.js"

/**
 * The persisted profile record — deliberately connector-free: the two
 * cross-module preferences every module may read (`language`, `theme`), the
 * per-module `modules.<module>` slice transport, and server-managed metadata.
 * Everything a connector wants to persist lives in ITS slice (validated
 * fail-soft by the owning module), never as a new top-level field here.
 *
 * `id` is the profile key (the OAuth caller's id, or `anonymous` for an
 * explicitly declared local caller — see `resolveProfileKey` in `profile.ts`);
 * `userId` is the owner a save stamped (absent on the anonymous record).
 */
export const profileRecordSchema = z.object({
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
  modules: z
    .record(z.string(), z.unknown())
    .default({})
    .describe(
      "Per-module settings slices, keyed by module name (e.g. `analytics`, `camunda7`). Each " +
        "module owns its slice's schema, validates it fail-soft on read, and writes it through " +
        "its own save tool — this record only transports the slices.",
    ),
  id: z.string(),
  userId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION).default(PROFILE_SCHEMA_VERSION),
})

export type ProfileRecord = z.infer<typeof profileRecordSchema>

/**
 * Save input: any subset of the record's user-settable fields. Omitted fields
 * keep their current value (the store merges over the existing record);
 * `modules` slices merge per module key, one level deep — a save carrying
 * `modules.analytics` spreads over the stored analytics slice (explicit
 * `undefined` clears a field) and leaves other modules' slices untouched.
 *
 * A plain type, not a zod schema: validation happens at each module's TOOL
 * boundary (with a default-free schema — see `withoutDefaults` in
 * `profile.ts`), not in the store.
 */
export interface ProfileRecordSaveInput {
  language?: Locale
  theme?: ThemePref
  modules?: Record<string, unknown>
}

/** A fully-defaulted record for a key that has never been saved. */
export function defaultProfileRecord(key: string): ProfileRecord {
  const now = new Date().toISOString()
  return {
    ...profileRecordSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse({}),
    id: key,
    userId: undefined,
    createdAt: now,
    updatedAt: now,
  }
}

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

/** The field's own value when it validates, else the field's default. */
function fieldOrDefault<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : schema.parse(undefined)
}

/**
 * The typed VIEW of a stored profile document (current-shape, or written by a
 * NEWER build), degrading per FIELD: a value this build cannot validate — a
 * locale added later, a non-object `modules` — falls back to that field's
 * default while everything else survives. Keys this build does not know are
 * not part of the view, but they stay in the stored document: saves merge over
 * the RAW document (`mergeStoredProfile` in `profile-store.ts`), never over
 * this projection. Timestamps a hand-edited document lacks fall back to each
 * other, then to `""` (the next save stamps both). `id` is the caller's (the
 * store key wins).
 */
export function projectProfileRecord(doc: Record<string, unknown>, id: string): ProfileRecord {
  const whole = profileRecordSchema.safeParse(doc)
  if (whole.success) return { ...whole.data, id }
  const { shape } = profileRecordSchema
  const updatedAt = nonEmptyString(doc.updatedAt) ?? nonEmptyString(doc.createdAt) ?? ""
  return {
    language: fieldOrDefault(shape.language, doc.language),
    theme: fieldOrDefault(shape.theme, doc.theme),
    modules: fieldOrDefault(shape.modules, doc.modules),
    id,
    userId: fieldOrDefault(shape.userId, doc.userId),
    createdAt: nonEmptyString(doc.createdAt) ?? updatedAt,
    updatedAt,
    schemaVersion: PROFILE_SCHEMA_VERSION,
  }
}
