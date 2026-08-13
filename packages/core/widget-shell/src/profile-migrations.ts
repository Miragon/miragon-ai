import { PROFILE_SCHEMA_VERSION } from "./profile-constants.js"
import { profileRecordSchema, type ProfileRecord } from "./profile-record.js"

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

/**
 * Move flat top-level fields into a module's `modules.<module>` slice —
 * the recurring shape of every "a connector's preferences leave the flat
 * record" migration. Field values only move when the slice doesn't already
 * carry them (`??=`), so a record that somehow has both keeps the slice's.
 *
 * Historical field names are deliberately string knowledge here: migrations
 * describe the stored record's HISTORY, not any module's current schema, so
 * this core package never imports connector code for them.
 */
function moveFlatFieldsIntoSlice(
  raw: Record<string, unknown>,
  module: string,
  moves: ReadonlyArray<{ from: string; to: string }>,
): void {
  const modules = asObject(raw.modules)
  const slice = { ...asObject(modules[module]) }
  for (const { from, to } of moves) {
    if (raw[from] !== undefined) slice[to] ??= raw[from]
    delete raw[from]
  }
  raw.modules = { ...modules, ...(Object.keys(slice).length > 0 ? { [module]: slice } : {}) }
}

/**
 * Record-level migrations, keyed by the version they upgrade FROM. Every
 * `PROFILE_SCHEMA_VERSION` bump adds exactly one entry here, so a record
 * written by any older build upgrades on read instead of being reset to
 * defaults. Migrations transform the raw JSON — the migrated result still goes
 * through `profileRecordSchema.safeParse`, which is the actual gate.
 */
const PROFILE_MIGRATIONS: Record<number, (raw: Record<string, unknown>) => void> = {
  // v1 → v2: the analytics preferences move from flat camunda7-owned fields
  // into the module-owned `modules.analytics` slice (renamed to the slice's
  // own vocabulary — the module, not the profile, prefixes them).
  1: (raw) => {
    moveFlatFieldsIntoSlice(raw, "analytics", [
      { from: "analyticsDefaultPeriod", to: "defaultPeriod" },
      { from: "analyticsMinBucketSize", to: "minBucketSize" },
    ])
  },
  // v2 → v3: the camunda7 engine/dashboard preferences move from the flat
  // record into the module-owned `modules.camunda7` slice; the record itself
  // is connector-free since.
  2: (raw) => {
    moveFlatFieldsIntoSlice(
      raw,
      "camunda7",
      [
        "defaultEngineId",
        "allowedEngineIds",
        "pinnedDashboardIds",
        "defaultDashboardId",
        "preferredRole",
      ].map((field) => ({ from: field, to: field })),
    )
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
export function parseStoredProfile(json: unknown): ProfileRecord | undefined {
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

  const parsed = profileRecordSchema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}
