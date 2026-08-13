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
 * `id` is the profile key (the authenticated user id under `MCP_OAUTH`, else
 * the MCP session id — see `resolveProfileKey` in `profile.ts`).
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
