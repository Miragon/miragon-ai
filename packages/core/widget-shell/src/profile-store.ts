import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { ANONYMOUS_PROFILE_KEY } from "./profile.js"
import { PROFILE_SCHEMA_VERSION } from "./profile-constants.js"
import { migrateStoredProfile, parseStoredProfile } from "./profile-migrations.js"
import {
  defaultProfileRecord,
  projectProfileRecord,
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
  /**
   * The typed view of the stored record (`parseStoredProfile`): per-field
   * fail-soft, so an unknown value degrades only its own field and a newer
   * build's record reads best-effort; `undefined` when nothing is stored.
   */
  get(key: string): Promise<ProfileRecord | undefined>
  /**
   * Merge `input` over the RAW stored record (or defaults) — atomically per
   * key, so concurrent saves of disjoint fields or module slices all survive
   * ({@link mergeStoredProfile}); stamps `updatedAt`. `opts.userId` (the
   * authenticated user, when known) marks the record as user-bound — the
   * marker that exempts it from {@link cleanupSessions}.
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * One-level module-slice merge: each module key in the patch spreads over the
 * stored slice of the SAME module (non-object slices replace), other modules'
 * slices stay untouched. A field explicitly set to `undefined` overrides the
 * stored value and drops out on serialization — that is how a module's save
 * tool clears a field.
 */
function mergeModuleSlices(
  prev: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next = { ...prev }
  for (const [module, slice] of Object.entries(patch ?? {})) {
    const stored = next[module]
    next[module] = isPlainObject(stored) && isPlainObject(slice) ? { ...stored, ...slice } : slice
  }
  return next
}

/** The outcome of {@link mergeStoredProfile}: what to persist, and what to return. */
export interface MergedProfile {
  /**
   * The complete document to persist: the RAW stored JSON — keys this build
   * does not know and values it cannot validate included — with the save
   * applied on top.
   */
  document: Record<string, unknown>
  /** The typed view of `document` — what a store's `save` returns. */
  record: ProfileRecord
}

/**
 * Merge a partial save over the RAW stored document (or a fresh default),
 * preserving `id`/`userId`/`createdAt` and re-stamping `updatedAt`. Omitted
 * input fields keep their previous value so single-field updates don't wipe
 * the rest — and because the base is the stored JSON, not its parsed view,
 * nothing this build cannot read is dropped either: a locale a newer build
 * added, a top-level key it introduced, a whole newer-version document during
 * a rolling deploy (whose `schemaVersion` is never stamped down). Shared by
 * every store implementation (in-memory, filesystem, and the postgres sibling
 * in `profile-store-postgres.ts`), each calling it INSIDE its per-key
 * serialization, so the merge semantics stay single-sourced. Record-agnostic
 * on purpose — module-specific normalization (e.g. camunda7's "empty string
 * clears the field") happens at the owning module's save-tool boundary.
 */
export function mergeStoredProfile(
  key: string,
  stored: unknown,
  input: ProfileRecordSaveInput,
  now: string,
  opts?: ProfileSaveOptions,
): MergedProfile {
  const migrated = migrateStoredProfile(stored)
  const prev: Record<string, unknown> = migrated?.doc ?? { ...defaultProfileRecord(key) }
  const prevRecord = projectProfileRecord(prev, key)
  const document: Record<string, unknown> = {
    ...prev,
    ...stripUndefined(input),
    // Module slices merge per module key, one level deep: a save carrying
    // `modules.analytics` spreads over the STORED analytics slice (a field
    // explicitly set to `undefined` clears on serialization) and leaves other
    // modules' slices intact. Merging here — inside the store's per-key
    // serialization — rather than replacing means two concurrent saves of
    // DISJOINT fields in the same slice both survive; the save tool's
    // pre-read (`mergeRawSlice`) alone cannot guarantee that.
    modules: mergeModuleSlices(prevRecord.modules, input.modules),
    id: key,
    // Once user-bound, always user-bound — a later save without auth context
    // must not demote the record back into the session-TTL cleanup scope.
    userId: opts?.userId ?? prevRecord.userId,
    createdAt: prevRecord.createdAt || now,
    updatedAt: now,
    schemaVersion: migrated?.version ?? PROFILE_SCHEMA_VERSION,
  }
  return { document, record: projectProfileRecord(document, key) }
}

/**
 * The typed half of {@link mergeStoredProfile} — the 0.18 signature, kept for
 * custom stores built on it. `existing` may be the RAW stored JSON (preferred:
 * unknown keys then survive) or an already-parsed record.
 */
export function mergeProfile(
  key: string,
  existing: ProfileRecord | Record<string, unknown> | undefined,
  input: ProfileRecordSaveInput,
  now: string,
  opts?: ProfileSaveOptions,
): ProfileRecord {
  return mergeStoredProfile(key, existing, input, now, opts).record
}

/**
 * Process-local store. The default when `MCP_PROFILE_DIR` is unset — fine for
 * dev and single-instance deployments; everything is lost on restart, and
 * behind a load balancer each replica sees its own records. Each save runs
 * synchronously inside one microtask, so saves of the same key never
 * interleave.
 */
export function createInMemoryProfileStore(): ProfileStore {
  const byKey = new Map<string, Record<string, unknown>>()
  const read = (key: string) => parseStoredProfile(byKey.get(key), key)
  return {
    get(key) {
      return Promise.resolve(read(key))
    },
    save(key, input, opts) {
      return Promise.resolve().then(() => {
        const merged = mergeStoredProfile(key, byKey.get(key), input, nowIso(), opts)
        byKey.set(key, merged.document)
        return merged.record
      })
    },
    delete(key) {
      return Promise.resolve(byKey.delete(key))
    },
    cleanupSessions(olderThan) {
      let removed = 0
      for (const key of [...byKey.keys()]) {
        const record = read(key)
        if (record && isExpiredSessionRecord(key, record, olderThan) && byKey.delete(key)) {
          removed += 1
        }
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
 * The tail of each file's pending operations, keyed by absolute path —
 * module-wide, so two store instances on the same directory (in one process)
 * serialize too. An entry is dropped once its chain drains.
 */
const fileLocks = new Map<string, Promise<void>>()

/**
 * Run `fn` once every earlier operation on `file` has settled — a promise
 * chain per file, so a read-merge-write can never interleave with another one
 * for the same key. A failed operation releases the lock like a successful one.
 */
function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = path.resolve(file)
  const run = (fileLocks.get(lockKey) ?? Promise.resolve()).then(fn)
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  fileLocks.set(lockKey, tail)
  void tail.then(() => {
    if (fileLocks.get(lockKey) === tail) fileLocks.delete(lockKey)
  })
  return run
}

const isMissing = (err: unknown) => (err as NodeJS.ErrnoException).code === "ENOENT"

/**
 * Profiles stored as one JSON file per key under `dir` (`<encodeURIComponent
 * (key)>.json`). Selected when `MCP_PROFILE_DIR` is set so preferences survive
 * restarts. Every operation on a key runs under a per-key lock, so concurrent
 * saves of the same key (two settings sections, two modules' save tools in one
 * model turn) merge one after the other instead of last-write-wins; writes are
 * atomic (temp file + rename in the same directory), so a crash mid-write
 * can't truncate a record. The lock is process-local: the store is
 * SINGLE-WRITER — point one server process at a directory (the postgres store
 * is the multi-instance answer).
 */
export function createFileSystemProfileStore(options: { dir: string }): ProfileStore {
  const { dir } = options
  const fileFor = (key: string) => path.join(dir, `${encodeURIComponent(key)}.json`)

  /** The stored JSON, `undefined` when there is no file or it is not JSON. */
  const readJson = async (key: string): Promise<unknown> => {
    let raw: string
    try {
      raw = await fs.readFile(fileFor(key), "utf-8")
    } catch (err) {
      if (isMissing(err)) return undefined
      throw err
    }
    // A file that is not JSON at all (hand-edited, foreign) cannot be merged
    // over — it reads as "no record" and the next save replaces it. Valid JSON
    // is never discarded: unknown keys and values survive every save.
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return undefined
    }
  }

  const readRecord = async (key: string): Promise<ProfileRecord | undefined> =>
    parseStoredProfile(await readJson(key), key)

  return {
    get: readRecord,
    save(key, input, opts) {
      const file = fileFor(key)
      return withFileLock(file, async () => {
        const merged = mergeStoredProfile(key, await readJson(key), input, nowIso(), opts)
        await fs.mkdir(dir, { recursive: true })
        // Unique tmp name per write, renamed over the record in one step.
        const tmp = `${file}.${randomUUID()}.tmp`
        await fs.writeFile(tmp, JSON.stringify(merged.document, null, 2), "utf-8")
        await fs.rename(tmp, file)
        return merged.record
      })
    },
    delete(key) {
      const file = fileFor(key)
      return withFileLock(file, async () => {
        try {
          await fs.unlink(file)
          return true
        } catch (err) {
          if (isMissing(err)) return false
          throw err
        }
      })
    },
    async cleanupSessions(olderThan) {
      let entries: string[]
      try {
        entries = await fs.readdir(dir)
      } catch (err) {
        if (isMissing(err)) return 0
        throw err
      }
      let removed = 0
      for (const entry of entries) {
        // Only our records; corrupt files stay (fail-soft — a save overwrites
        // them), tmp files belong to an in-flight write.
        if (!entry.endsWith(".json")) continue
        const key = decodeURIComponent(entry.slice(0, -".json".length))
        const file = fileFor(key)
        // Check + unlink under the key's lock: a save landing in between
        // would otherwise be deleted although it just refreshed `updatedAt`.
        const expired = await withFileLock(file, async () => {
          const record = await readRecord(key)
          if (!record || !isExpiredSessionRecord(key, record, olderThan)) return false
          try {
            await fs.unlink(file)
            return true
          } catch (err) {
            if (isMissing(err)) return false
            throw err
          }
        })
        if (expired) removed += 1
      }
      return removed
    },
  }
}
