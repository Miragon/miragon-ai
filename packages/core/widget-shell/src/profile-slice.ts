import { resolveProfileKey } from "./profile.js"
import type { ProfileSource } from "./profile.js"

/**
 * The write-side half of the `profile.modules.<module>` slice contract —
 * shared by every module's save tool so the two subtle rules cannot drift:
 * WHOSE record a save touches (the canonical keyless refusal) and HOW a slice
 * patch merges (over the RAW stored slice, so foreign fields survive).
 */

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
 * never set. The store's per-module-key merge then REPLACES exactly this
 * slice, so the returned object is the complete next slice value.
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
