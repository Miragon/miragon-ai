import type { z } from "zod"
import { resolveProfileKey } from "./profile.js"
import type { ProfileSource } from "./profile.js"

/**
 * The `profile.modules.<module>` slice contract, shared by every module so
 * the subtle rules cannot drift: WHOSE record a save touches (the canonical
 * keyless refusal), HOW a slice patch merges (over the RAW stored slice, so
 * foreign fields survive), and HOW a slice reads (fail-soft per FIELD, so one
 * bad value cannot reset the rest).
 */

/**
 * Fail-soft slice read: absent slices and garbage degrade to the schema's
 * defaults — and degradation is per FIELD, not per slice: a single invalid
 * value (say, one written by a newer build and then rolled back) drops to its
 * own default while every other saved preference survives. Fields the schema
 * doesn't know stay out of the VIEW but are preserved in storage by
 * {@link mergeRawSlice}.
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
 * Resolve the profile key for a durable write, refusing without one. An HTTP
 * request without any identity resolves no key (mcp-use 2 issues no MCP
 * session ids) — writing anyway would silently share one record across
 * unrelated keyless clients, so every module's save tool throws this same,
 * operator-actionable error instead.
 */
export function requireProfileKey(ctx?: unknown): string {
  const key = resolveProfileKey(ctx)
  if (!key) {
    throw new Error(
      "No caller identity to save the profile under (mcp-use 2 issues no MCP session ids) — configure MCP_OAUTH so settings persist per user.",
    )
  }
  return key
}

/**
 * Merge a partial update over the RAW stored slice of `module`, not the
 * parsed one: unknown fields a newer build may have written survive, and
 * defaults are not silently materialized into storage for fields the caller
 * never set. The returned object is the complete next slice value the tool
 * reports back; the store then merges it one level deep over the stored
 * slice INSIDE its per-key lock, so a concurrent save of disjoint fields in
 * the same slice survives even though this pre-read runs outside it.
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
