import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { ANONYMOUS_PROFILE_KEY } from "./profile.js"
import { PROFILE_SCHEMA_VERSION } from "./profile-constants.js"
import { parseStoredProfile } from "./profile-migrations.js"
import {
  defaultProfileRecord,
  type ProfileRecord,
  type ProfileRecordSaveInput,
} from "./profile-record.js"

/**
 * Persistence for user profiles, keyed by the profile key (the authenticated
 * user id when the deployment runs with `MCP_OAUTH`, else the MCP session id —
 * see {@link resolveProfileKey} in `profile.ts`). Deliberately mirrors the
 * toolkit's `DashboardStore` shape: an in-memory default plus a
 * one-file-per-record filesystem store selected by an env var (and a postgres
 * implementation in `profile-store-postgres.ts` selected by `DATABASE_URL` in
 * the composition root). There is no cross-key ownership model — each key owns
 * exactly its own record; the auth layer keeps unrelated callers on different
 * keys.
 *
 * The full store interface is for COMPOSITION ROOTS (apps wiring
 * `SharedResources`); modules consume the narrow {@link ProfileSource} port
 * instead — which this interface satisfies structurally.
 */
export interface ProfileStore {
  get(key: string): Promise<ProfileRecord | undefined>
  /**
   * Merge `input` over the existing record (or defaults); stamps `updatedAt`.
   * `opts.userId` (the authenticated user, when known) marks the record as
   * user-bound — the marker that exempts it from {@link cleanupSessions}.
   */
  save(
    key: string,
    input: ProfileRecordSaveInput,
    opts?: ProfileSaveOptions,
  ): Promise<ProfileRecord>
  delete(key: string): Promise<boolean>
  /**
   * Delete SESSION-keyed records (no `userId`, not the shared anonymous
   * record) whose `updatedAt` is older than `olderThan`; returns the count.
   * Session ids die with their MCP session, so these rows are unreachable
   * garbage — user-bound records never expire here.
   */
  cleanupSessions(olderThan: Date): Promise<number>
}

export interface ProfileSaveOptions {
  /** Authenticated user id to stamp onto the record (absent for session saves). */
  userId?: string
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
 * single-sourced. Record-agnostic on purpose — module-specific normalization
 * (e.g. camunda7's "empty string clears the field") happens at the owning
 * module's save-tool boundary, inside its slice.
 */
export function mergeProfile(
  key: string,
  existing: ProfileRecord | undefined,
  input: ProfileRecordSaveInput,
  now: string,
  opts?: ProfileSaveOptions,
): ProfileRecord {
  const prev = existing ?? defaultProfileRecord(key)
  return {
    ...prev,
    ...stripUndefined(input),
    // Module slices merge per module key: a save carrying `modules.analytics`
    // replaces exactly that slice and leaves other modules' slices intact.
    modules: { ...prev.modules, ...input.modules },
    id: key,
    // Once user-bound, always user-bound — a later save without auth context
    // must not demote the record back into the session-TTL cleanup scope.
    userId: opts?.userId ?? prev.userId,
    createdAt: prev.createdAt,
    updatedAt: now,
    schemaVersion: PROFILE_SCHEMA_VERSION,
  }
}

/**
 * Process-local store. The default when `MCP_PROFILE_DIR` is unset — fine for
 * dev and stateless deployments; everything is lost on restart (same trade-off
 * as the session-sticky engine selection it complements).
 */
export function createInMemoryProfileStore(): ProfileStore {
  const byKey = new Map<string, ProfileRecord>()
  return {
    get(key) {
      return Promise.resolve(byKey.get(key))
    },
    save(key, input, opts) {
      return Promise.resolve().then(() => {
        const record = mergeProfile(key, byKey.get(key), input, nowIso(), opts)
        byKey.set(key, record)
        return record
      })
    },
    delete(key) {
      return Promise.resolve(byKey.delete(key))
    },
    cleanupSessions(olderThan) {
      let removed = 0
      for (const [key, record] of byKey) {
        if (isExpiredSessionRecord(key, record, olderThan) && byKey.delete(key)) removed += 1
      }
      return Promise.resolve(removed)
    },
  }
}

/** The one cleanup predicate all store implementations share. */
export function isExpiredSessionRecord(
  key: string,
  record: ProfileRecord,
  olderThan: Date,
): boolean {
  if (key === ANONYMOUS_PROFILE_KEY) return false
  if (record.userId) return false
  const updatedAt = Date.parse(record.updatedAt)
  return Number.isFinite(updatedAt) && updatedAt < olderThan.getTime()
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

  const readRecord = async (key: string): Promise<ProfileRecord | undefined> => {
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
    async save(key, input, opts) {
      const record = mergeProfile(key, await readRecord(key), input, nowIso(), opts)
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
    async cleanupSessions(olderThan) {
      let entries: string[]
      try {
        entries = await fs.readdir(dir)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0
        throw err
      }
      let removed = 0
      for (const entry of entries) {
        // Only our records; corrupt files stay (fail-soft — a save overwrites
        // them), tmp files belong to an in-flight write.
        if (!entry.endsWith(".json")) continue
        const key = decodeURIComponent(entry.slice(0, -".json".length))
        const record = await readRecord(key)
        if (!record || !isExpiredSessionRecord(key, record, olderThan)) continue
        try {
          await fs.unlink(fileFor(key))
          removed += 1
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
        }
      }
      return removed
    },
  }
}
