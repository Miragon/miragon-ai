import { PROFILE_SCHEMA_VERSION } from "./profile-constants.js"
import { userProfileSchema, type UserProfile } from "./profile-schema.js"

/**
 * Record-level migrations, keyed by the version they upgrade FROM. Every
 * `PROFILE_SCHEMA_VERSION` bump adds exactly one entry here, so a record
 * written by any older build upgrades on read instead of being reset to
 * defaults. Migrations transform the raw JSON — the migrated result still goes
 * through `userProfileSchema.safeParse`, which is the actual gate.
 */
const PROFILE_MIGRATIONS: Record<number, (raw: Record<string, unknown>) => void> = {
  // v1 → v2: the analytics preferences move from flat camunda7-owned fields
  // into the module-owned `modules.analytics` slice (renamed to the slice's
  // own vocabulary — the module, not the profile, prefixes them).
  1: (raw) => {
    const modules =
      typeof raw.modules === "object" && raw.modules !== null
        ? (raw.modules as Record<string, unknown>)
        : {}
    const analytics: Record<string, unknown> = {
      ...(typeof modules.analytics === "object" && modules.analytics !== null
        ? (modules.analytics as Record<string, unknown>)
        : {}),
    }
    if (raw.analyticsDefaultPeriod !== undefined) {
      analytics.defaultPeriod ??= raw.analyticsDefaultPeriod
    }
    if (raw.analyticsMinBucketSize !== undefined) {
      analytics.minBucketSize ??= raw.analyticsMinBucketSize
    }
    delete raw.analyticsDefaultPeriod
    delete raw.analyticsMinBucketSize
    raw.modules = { ...modules, ...(Object.keys(analytics).length > 0 ? { analytics } : {}) }
  },
}

/**
 * Parse a persisted profile record of ANY supported schema version into the
 * current shape — the single read gate shared by the filesystem and postgres
 * stores (mirroring the toolkit's tolerant `parseDashboardRecord`):
 *
 *   - older versions upgrade through {@link PROFILE_MIGRATIONS} step by step;
 *   - a NEWER version (written by a newer build) reads as `undefined` rather
 *     than being mangled — the next save of THIS build overwrites it, which is
 *     the store's documented last-write-wins behavior;
 *   - anything unparseable reads as `undefined` (fail-soft, like a corrupt file).
 *
 * A missing/invalid `schemaVersion` is treated as version 1 — every record
 * ever written carried one, so this only softens hand-edited files.
 */
export function parseStoredProfile(json: unknown): UserProfile | undefined {
  if (typeof json !== "object" || json === null) return undefined
  const raw: Record<string, unknown> = { ...(json as Record<string, unknown>) }

  const rawVersion = raw.schemaVersion
  let version = typeof rawVersion === "number" && Number.isInteger(rawVersion) ? rawVersion : 1
  if (version > PROFILE_SCHEMA_VERSION || version < 1) return undefined

  while (version < PROFILE_SCHEMA_VERSION) {
    PROFILE_MIGRATIONS[version]?.(raw)
    version += 1
    raw.schemaVersion = version
  }

  const parsed = userProfileSchema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}
