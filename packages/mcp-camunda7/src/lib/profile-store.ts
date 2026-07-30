import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { PROFILE_SCHEMA_VERSION } from "./profile-constants.js"
import { parseStoredProfile } from "./profile-migrations.js"
import {
  defaultUserProfile,
  type UserProfile,
  type UserProfileSaveInput,
} from "./profile-schema.js"

/**
 * Persistence for user profiles, keyed by the profile key (the MCP session id
 * today, an authenticated user id once auth lands — see {@link resolveProfileKey}).
 * Deliberately mirrors the toolkit's `DashboardStore` shape: an in-memory
 * default plus a one-file-per-record filesystem store selected by an env var
 * (and a postgres implementation in `profile-store-postgres.ts` selected by
 * `DATABASE_URL` in the server app).
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
 * Shared by every store implementation (in-memory, filesystem, and the postgres
 * sibling in `profile-store-postgres.ts`) so the merge semantics stay
 * single-sourced.
 */
export function mergeProfile(
  key: string,
  existing: UserProfile | undefined,
  input: UserProfileSaveInput,
  now: string,
): UserProfile {
  const prev = existing ?? defaultUserProfile(key)
  const merged: UserProfile = {
    ...prev,
    ...stripUndefined(input),
    // Module slices merge per module key: a save carrying `modules.analytics`
    // replaces exactly that slice and leaves other modules' slices intact.
    modules: { ...prev.modules, ...input.modules },
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
 * restarts. Writes are atomic (temp file + rename in the same directory), so a
 * crash mid-write can't truncate a record; concurrent saves of the same key
 * still resolve last-write-wins — there is no cross-process lock, which is
 * fine for the "single user clicking Save" workflow (the postgres store is the
 * multi-instance answer).
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
    // the read path; the next save overwrites it with a valid record. JSON
    // syntax errors are guarded here; version upgrades + schema validation live
    // in `parseStoredProfile` (shared with the postgres store).
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return undefined
    }
    return parseStoredProfile(json)
  }

  return {
    get: readRecord,
    async save(key, input) {
      const record = mergeProfile(key, await readRecord(key), input, nowIso())
      await fs.mkdir(dir, { recursive: true })
      const file = fileFor(key)
      // Per-CALL unique tmp name: concurrent saves of the same key (the
      // settings page has two independent save buttons) each rename their own
      // tmp file, so the outcome is genuine last-write-wins instead of an
      // ENOENT on the second rename.
      const tmp = `${file}.${randomUUID()}.tmp`
      await fs.writeFile(tmp, JSON.stringify(record, null, 2), "utf-8")
      await fs.rename(tmp, file)
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
