import fs from "node:fs/promises"
import path from "node:path"
import { PROFILE_SCHEMA_VERSION } from "./profile-constants.js"
import {
  defaultUserProfile,
  userProfileSchema,
  type UserProfile,
  type UserProfileSaveInput,
} from "./profile-schema.js"

/**
 * Persistence for user profiles, keyed by the profile key (the MCP session id
 * today, an authenticated user id once auth lands — see {@link resolveProfileKey}).
 * Deliberately mirrors the toolkit's `DashboardStore` shape: an in-memory
 * default plus a one-file-per-record filesystem store selected by an env var.
 * The key never identifies a person without auth, so there is no cross-key
 * ownership model — each key owns exactly its own record.
 */
export interface ProfileStore {
  get(key: string): Promise<UserProfile | undefined>
  /** Merge `input` over the existing record (or defaults); stamps `updatedAt`. */
  save(key: string, input: UserProfileSaveInput): Promise<UserProfile>
  delete(key: string): Promise<boolean>
}

function nowIso(): string {
  return new Date().toISOString()
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

/**
 * Merge a partial save over the previous record (or a fresh default), preserving
 * `id`/`userId`/`createdAt` and re-stamping `updatedAt`. Omitted input fields
 * keep their previous value so single-field updates don't wipe the rest.
 */
function mergeProfile(
  key: string,
  existing: UserProfile | undefined,
  input: UserProfileSaveInput,
  now: string,
): UserProfile {
  const prev = existing ?? defaultUserProfile(key)
  const merged: UserProfile = {
    ...prev,
    ...stripUndefined(input),
    id: key,
    userId: prev.userId,
    createdAt: prev.createdAt,
    updatedAt: now,
    schemaVersion: PROFILE_SCHEMA_VERSION,
  }
  // The settings UI sends an empty string for the "(auto)"/"(none)" option of an
  // optional id field — normalise that to "unset" so the field can be cleared.
  if (merged.defaultEngineId === "") merged.defaultEngineId = undefined
  if (merged.defaultDashboardId === "") merged.defaultDashboardId = undefined
  return merged
}

/**
 * Process-local store. The default when `MCP_PROFILE_DIR` is unset — fine for
 * dev and stateless deployments; everything is lost on restart (same trade-off
 * as the session-sticky engine selection it complements).
 */
export function createInMemoryProfileStore(): ProfileStore {
  const byKey = new Map<string, UserProfile>()
  return {
    get(key) {
      return Promise.resolve(byKey.get(key))
    },
    save(key, input) {
      return Promise.resolve().then(() => {
        const record = mergeProfile(key, byKey.get(key), input, nowIso())
        byKey.set(key, record)
        return record
      })
    },
    delete(key) {
      return Promise.resolve(byKey.delete(key))
    },
  }
}

/**
 * Profiles stored as one JSON file per key under `dir` (`<encodeURIComponent
 * (key)>.json`). Selected when `MCP_PROFILE_DIR` is set so preferences survive
 * restarts. Locking is advisory — concurrent writes of the same key can race,
 * fine for the "single user clicking Save" workflow.
 */
export function createFileSystemProfileStore(options: { dir: string }): ProfileStore {
  const { dir } = options
  const fileFor = (key: string) => path.join(dir, `${encodeURIComponent(key)}.json`)

  const readRecord = async (key: string): Promise<UserProfile | undefined> => {
    let raw: string
    try {
      raw = await fs.readFile(fileFor(key), "utf-8")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw err
    }
    // A corrupt/foreign file is treated as "not our record" rather than crashing
    // the read path; the next save overwrites it with a valid record. Both the
    // JSON syntax (e.g. a truncated write) and the schema are guarded here.
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return undefined
    }
    const parsed = userProfileSchema.safeParse(json)
    return parsed.success ? parsed.data : undefined
  }

  return {
    get: readRecord,
    async save(key, input) {
      const record = mergeProfile(key, await readRecord(key), input, nowIso())
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(fileFor(key), JSON.stringify(record, null, 2), "utf-8")
      return record
    },
    async delete(key) {
      try {
        await fs.unlink(fileFor(key))
        return true
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return false
        throw err
      }
    },
  }
}
