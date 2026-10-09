/**
 * The cross-module contract for user settings: WHOSE profile a request touches
 * and WHAT shape a module may read/write on it.
 *
 * Modules are peers and never import each other, but they all read and write
 * ONE shared profile record — so the key resolution and the fallback key are
 * not per-module opinions, they are a contract that must be byte-identical
 * everywhere. Two modules resolving different keys for the same caller would
 * silently split a user's settings across two records (language from one,
 * analytics defaults from another) without any error. This module is that
 * single source, imported by both the profile store's owner (camunda7) and
 * every module that keeps a `profile.modules.<module>` slice.
 *
 * Lives on the `/server` path only — the ambient request info pulls in
 * `node:async_hooks`, which must never reach the widget bundle.
 */
import { resolveCaller } from "@miragon/mcp-toolkit-core"
import { z } from "zod"
import { getMcpRequestInfo } from "./request-context.js"

/**
 * The profile key of an EXPLICITLY declared local caller — a transport without
 * auth that serves exactly one user (stdio, tests), declared via
 * `runWithMcpRequestInfo({ anonymousCaller: true }, …)`. Never reached by an
 * HTTP request: a request without OAuth has no identity at all.
 */
export const ANONYMOUS_PROFILE_KEY = "anonymous"

/**
 * The minimal structural view of the profile store a module needs for its own
 * settings slice: read the record, and (when the host wired a writable store)
 * write back a `modules` patch. Deliberately narrower than camunda7's
 * `ProfileStore` — a module has no business with `delete` or with another
 * module's slice. `save` merges per module key on the store side,
 * one level deep and atomically per key: a `modules.<yours>` patch spreads
 * over your stored slice (`undefined` clears a field) and never touches a
 * foreign slice, which is what lets a save carry its patch alone
 * (`saveModuleSlice`).
 */
export interface ProfileSource {
  get(key: string): Promise<ProfileSlice | undefined>
  save?(
    key: string,
    input: { modules: Record<string, unknown> },
    opts?: { userId?: string },
  ): Promise<unknown>
}

/** The slice of the shared profile record a foreign module may read. */
export interface ProfileSlice {
  /** UI + summary language, for localizing the module's own tool summaries. */
  language?: string
  /** Per-module settings slices, keyed by module name. */
  modules?: Record<string, unknown>
}

/**
 * Resolves the key a user profile hangs on — the single place that decides
 * "whose profile is this", shared by every module. Fail-closed precedence:
 *
 *   1. the OAuth caller — resolved from the handler `ctx` through the
 *      toolkit's `resolveCaller` whenever a `ctx` is passed (registrar and
 *      widget-tool handlers all have one), else from the ambient request
 *      info the middleware derived the same way (ctx-less paths: pipeline
 *      steps). An authenticated `ctx` decides ALONE: a provider that maps no
 *      subject yields no key, never a fallback;
 *   2. {@link ANONYMOUS_PROFILE_KEY} for an explicitly declared local caller
 *      (`anonymousCaller` — stdio, tests; never set from a request);
 *   3. `undefined` otherwise — an HTTP request without OAuth, or no request
 *      context at all (a missing middleware install included). Reads fall back
 *      to defaults, saves refuse (`requireProfileKey`).
 *
 * Nothing a client chooses for itself (a session id, a header) is ever a key.
 * `ctx` is typed `unknown` so the mcp-use handler context (whose exact shape
 * isn't part of the stable surface) passes without a cast at the call site.
 */
export function resolveProfileKey(ctx?: unknown): string | undefined {
  const caller = resolveCaller(ctx)
  if (caller) return caller.userId
  const info = getMcpRequestInfo()
  if (info?.authUserId) return info.authUserId
  return info?.anonymousCaller ? ANONYMOUS_PROFILE_KEY : undefined
}

/**
 * Just the OAuth half of {@link resolveProfileKey}: the authenticated
 * caller's id (from `ctx`, else the ambient request info), never the declared
 * anonymous key. Save paths stamp it onto the record as its owner
 * (`opts.userId`), so a record says which signed-in user it belongs to.
 */
export function resolveAuthUserId(ctx?: unknown): string | undefined {
  const caller = resolveCaller(ctx)
  return caller ? caller.userId : getMcpRequestInfo()?.authUserId
}

/**
 * Strip `.default()` wrappers from a schema shape, keeping each field's
 * description — the safe way to derive a settings SAVE input from the schema
 * that defines the settings themselves.
 *
 * Zod 4 re-applies defaults THROUGH `.partial()` on parse, so a defaulted
 * partial would materialize omitted fields at the tool boundary: a
 * "single-field" save would then silently reset every other defaulted
 * preference. Save inputs therefore must be default-free — build them as
 * `z.object(withoutDefaults(schema.shape)).partial()`.
 */
export function withoutDefaults(shape: z.ZodRawShape): z.ZodRawShape {
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => {
      if (!(schema instanceof z.ZodDefault)) return [key, schema]
      const inner = schema.unwrap() as z.ZodType
      return [key, schema.description ? inner.describe(schema.description) : inner]
    }),
  )
}
