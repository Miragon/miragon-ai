import type { z } from "zod"
import { resolveProfileKey } from "./profile.js"
import type { ProfileSlice, ProfileSource } from "./profile.js"

/**
 * The `profile.modules.<module>` slice contract, shared by every module so
 * the subtle rules cannot drift: WHOSE record a save touches (the canonical
 * keyless refusal), HOW a slice patch is saved (the patch alone, merged by
 * the store over the RAW stored slice under its lock, so foreign and
 * concurrently saved fields survive), and HOW a slice reads (fail-soft per
 * FIELD, so one bad value cannot reset the rest).
 */

/**
 * Fail-soft slice read: absent slices and garbage degrade to the schema's
 * defaults — and degradation is per FIELD, not per slice: a single invalid
 * value (say, one written by a newer build and then rolled back) drops to its
 * own default while every other saved preference survives. Fields the schema
 * doesn't know stay out of the VIEW but are preserved in storage: a save
 * ({@link saveModuleSlice}) merges over the raw stored slice.
 *
 * Read-side only — save inputs keep validating loudly at the tool boundary;
 * a write must never silently coerce.
 */
export function parseModuleSlice<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  slice: unknown,
): z.output<z.ZodObject<T>> {
  const whole = schema.safeParse(slice ?? {})
  if (whole.success) return whole.data
  const raw = typeof slice === "object" && slice !== null ? (slice as Record<string, unknown>) : {}
  const kept: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    const value = raw[key]
    if (value === undefined) continue
    if ((field as z.ZodType).safeParse(value).success) kept[key] = value
  }
  const recovered = schema.safeParse(kept)
  return recovered.success ? recovered.data : schema.parse({})
}

/**
 * Resolve the profile key for a durable write, refusing without one. Settings
 * are saved per signed-in user: a request without OAuth resolves no key (see
 * `resolveProfileKey`) — writing anyway would silently share one record across
 * unrelated callers, so every module's save tool throws this same,
 * operator-actionable error instead.
 */
export function requireProfileKey(ctx?: unknown): string {
  const key = resolveProfileKey(ctx)
  if (!key) {
    throw new Error(
      "No caller identity to save the profile under — settings are saved per signed-in user, so the server needs MCP_OAUTH.",
    )
  }
  return key
}

/**
 * Persist a partial update of `module`'s slice: hand the store the PATCH
 * alone, never a slice pre-read outside the store's lock. Every
 * `ProfileStore` merges a `modules.<module>` patch one level deep over the
 * RAW stored slice INSIDE its per-key serialization (the postgres
 * transaction lock, the filesystem store's per-key mutex, the in-memory
 * store's synchronous merge), so a concurrent save of another field in the
 * same slice (or of another module's slice) survives, fields a newer build
 * wrote survive, and no defaults are materialized into storage. A field set
 * to `undefined` in the patch CLEARS the stored value; an absent field keeps
 * it.
 *
 * Returns the saved slice, raw (the caller parses it fail-soft for its
 * report): read off the record `save` returns (every shipped store returns
 * it), or read back when a custom port implementation returns nothing.
 */
export async function saveModuleSlice(
  store: { get: ProfileSource["get"]; save: NonNullable<ProfileSource["save"]> },
  key: string,
  module: string,
  patch: Record<string, unknown>,
  opts?: { userId?: string },
): Promise<unknown> {
  const saved = await store.save(key, { modules: { [module]: patch } }, opts)
  const record = isProfileSlice(saved) ? saved : await store.get(key)
  return record?.modules?.[module]
}

const isProfileSlice = (value: unknown): value is ProfileSlice =>
  typeof value === "object" && value !== null && "modules" in value

/**
 * Merge a partial update over the RAW stored slice of `module`, not the
 * parsed one: unknown fields a newer build may have written survive, and
 * defaults are not materialized for fields the caller never set.
 *
 * @deprecated Not a save path. The pre-read runs OUTSIDE the store's per-key
 * serialization, so handing this complete slice to `store.save` writes every
 * pre-read value back, and a concurrent save of another field in the same
 * slice is silently reverted. Save with {@link saveModuleSlice} (the patch
 * alone).
 */
export async function mergeRawSlice(
  store: ProfileSource,
  key: string,
  module: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rawSlice = (await store.get(key))?.modules?.[module]
  return {
    ...(typeof rawSlice === "object" && rawSlice !== null
      ? (rawSlice as Record<string, unknown>)
      : {}),
    ...patch,
  }
}
