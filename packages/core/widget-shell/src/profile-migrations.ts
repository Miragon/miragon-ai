import { PROFILE_SCHEMA_VERSION } from "./profile-constants.js"
import { projectProfileRecord, type ProfileRecord } from "./profile-record.js"

/** One record-level migration: reshapes the raw JSON of its FROM version in place. */
type ProfileMigration = (raw: Record<string, unknown>) => void

/**
 * The oldest record version this build reads as stored — the start of the
 * migration history. No history predates it (#322): records an earlier
 * pre-production build wrote at an older version are ADOPTED at the
 * baseline, never upgraded. Their fields this build does not know (the flat
 * module preferences of v1/v2) stay inert in the raw document — saves keep
 * them, the per-field projection ignores them — so those preferences read as
 * their defaults, while the fields every record has carried (`language`,
 * `theme`, `modules`) survive. A missing or out-of-range `schemaVersion`
 * reads as the baseline too.
 */
export const PROFILE_MIGRATION_BASELINE = 3

/**
 * Record-level migrations, keyed by the version they upgrade FROM: one entry
 * for every version from {@link PROFILE_MIGRATION_BASELINE} up to
 * `PROFILE_SCHEMA_VERSION`, so every `PROFILE_SCHEMA_VERSION` bump adds
 * exactly one entry here and a stored record upgrades on read instead of
 * losing its preferences. Migrations transform the raw JSON — the migrated
 * result still goes through the per-field `projectProfileRecord`, which is
 * the actual gate.
 *
 * Exported ONLY for the completeness test in `profile-migrations.test.ts`,
 * which fails the moment a `PROFILE_SCHEMA_VERSION` bump forgets its entry —
 * without it that mistake would surface as preferences read un-migrated.
 */
export const PROFILE_MIGRATIONS: Readonly<Record<number, ProfileMigration>> = {}

/** The history {@link migrateStoredProfile} walks — the shipped one unless a test injects its own. */
interface ProfileMigrationHistory {
  baseline: number
  current: number
  migrations: Readonly<Record<number, ProfileMigration>>
}

const SHIPPED_HISTORY: ProfileMigrationHistory = {
  baseline: PROFILE_MIGRATION_BASELINE,
  current: PROFILE_SCHEMA_VERSION,
  migrations: PROFILE_MIGRATIONS,
}

/** A stored document after {@link migrateStoredProfile}, plus the version it is now at. */
export interface MigratedProfileDocument {
  /** A shallow copy of the stored JSON, upgraded as far as the migrations reach. */
  doc: Record<string, unknown>
  version: number
}

/**
 * Upgrade a persisted profile document of ANY schema version as far as this
 * build can — the RAW half of the read gate, shared by the read path
 * ({@link parseStoredProfile}) and the save path (`mergeStoredProfile`):
 *
 *   - a version below the baseline is adopted AT the baseline (see
 *     {@link PROFILE_MIGRATION_BASELINE});
 *   - from there it upgrades through {@link PROFILE_MIGRATIONS} step by step;
 *   - a NEWER version (written by a newer build — rolling deploy, rollback)
 *     passes through untouched: an older build never reshapes it;
 *   - a missing migration (a build bug the completeness test catches) stops at
 *     the stuck version, so a fixed build can still upgrade the document.
 *
 * Unknown keys always survive. `undefined` only for JSON that is no object.
 */
export function migrateStoredProfile(
  json: unknown,
  history: ProfileMigrationHistory = SHIPPED_HISTORY,
): MigratedProfileDocument | undefined {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return undefined
  const doc: Record<string, unknown> = { ...(json as Record<string, unknown>) }

  const { baseline, current, migrations } = history
  const rawVersion = doc.schemaVersion
  // `Number.isInteger` is false for anything but an integer NUMBER.
  let version = Number.isInteger(rawVersion) ? Math.max(rawVersion as number, baseline) : baseline
  doc.schemaVersion = version

  while (version < current) {
    const migrate = migrations[version]
    if (!migrate) {
      console.error(
        `[widget-shell] No profile migration from schema v${version} — reading the stored record best-effort and keeping it un-migrated`,
      )
      break
    }
    migrate(doc)
    version += 1
    doc.schemaVersion = version
  }
  return { doc, version }
}

/**
 * Parse a persisted profile document into the current typed record — the
 * read gate shared by every store (mirroring the toolkit's tolerant
 * `parseDashboardRecord`): {@link migrateStoredProfile}, then the per-FIELD
 * projection `projectProfileRecord`, so one value this build cannot validate
 * degrades only that field and a newer build's document reads best-effort
 * instead of as "no record" (which the next save would have written defaults
 * over). Pass the store `key` as the record id; without one the stored `id`
 * is used, and a document carrying none reads as `undefined`, like JSON that
 * is no object.
 */
export function parseStoredProfile(json: unknown, key?: string): ProfileRecord | undefined {
  const migrated = migrateStoredProfile(json)
  if (!migrated) return undefined
  const id = key ?? (typeof migrated.doc.id === "string" ? migrated.doc.id : undefined)
  return id === undefined ? undefined : projectProfileRecord(migrated.doc, id)
}
