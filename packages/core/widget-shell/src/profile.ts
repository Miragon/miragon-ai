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
import { z } from "zod"
import { getMcpRequestInfo } from "./request-context.js"

/**
 * Shared fallback key for transports without any request context (stdio,
 * tests). Deliberately used by BOTH the read and the write path — a keyless
 * save persists under this record and is read back on the next load, so a local
 * stdio user gets one working (shared) profile instead of write-only saves that
 * never surface again. HTTP requests missing a session id do NOT map here (see
 * {@link resolveProfileKey}).
 */
export const ANONYMOUS_PROFILE_KEY = "anonymous"

/**
 * The auth-carrying slice of an mcp-use tool-handler `ctx` (its second
 * argument). mcp-use populates `ctx.auth.user` from the OAuth provider; it's
 * absent until an auth layer is wired, which is exactly the fallback
 * {@link resolveProfileKey} handles. The 2.x provider user objects carry the
 * subject as `id` (Keycloak/Auth0/…); `userId` is kept as the legacy 1.x
 * spelling so stored records and custom providers keep resolving.
 */
export interface ProfileAuthContext {
  auth?: { user?: { userId?: unknown; id?: unknown } }
}

/** First non-empty string among the user object's id spellings. */
function userIdOf(user: { userId?: unknown; id?: unknown } | undefined): string | undefined {
  for (const candidate of [user?.userId, user?.id]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate
  }
  return undefined
}

/**
 * The minimal structural view of the profile store a module needs for its own
 * settings slice: read the record, and (when the host wired a writable store)
 * write back a `modules` patch. Deliberately narrower than camunda7's
 * `ProfileStore` — a module has no business with `delete`/`cleanupSessions` or
 * with another module's slice. `save` merges per module key on the store side,
 * so writing `modules.<yours>` never touches a foreign slice.
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
 * "whose profile is this", shared by every module. Auth-ready by precedence:
 *
 *   1. the authenticated user id — from the tool-handler `ctx.auth.user.userId`
 *      when a `ctx` is passed, otherwise from the ambient request info
 *      (`request-context.ts` — the repo-owned mcp-use-2.x replacement for the
 *      removed request-context AsyncLocalStorage), so registrar handlers
 *      without a `ctx` still resolve the auth user;
 *   2. otherwise the MCP session id (transport session / `Mcp-Session-Id`
 *      header, from the same ambient info). mcp-use 2 itself issues no
 *      session ids (stateless HTTP serving), so this rung only matches when
 *      a fronting gateway stamps the header;
 *   3. {@link ANONYMOUS_PROFILE_KEY} when there is NO request context at all
 *      (stdio transport, tests) — the deliberate shared record;
 *   4. `undefined` for an HTTP request WITHOUT any identity — deliberately NOT
 *      the shared record, so unrelated keyless clients never cross-share one
 *      profile: reads fall back to defaults, saves fail visibly. Since
 *      mcp-use 2 this is the NORM for un-authenticated HTTP deployments —
 *      persistent settings need `MCP_OAUTH` (or a session-stamping gateway).
 *
 * `ctx` is typed `unknown` so the mcp-use handler context (whose exact shape
 * isn't part of the stable surface) passes without a cast at the call site —
 * the auth slice is read defensively here.
 */
export function resolveProfileKey(ctx?: unknown): string | undefined {
  const userId = resolveAuthUserId(ctx)
  if (userId) return userId

  const info = getMcpRequestInfo()
  if (!info) return ANONYMOUS_PROFILE_KEY

  return info.sessionId
}

/**
 * Just the authenticated-user half of {@link resolveProfileKey}: the user id
 * from the tool-handler `ctx.auth`, or from the ambient request info
 * (registrar handlers without a `ctx`), else `undefined`. Save paths
 * use this to STAMP `userId` onto the persisted record — the marker that
 * exempts a row from the session-TTL cleanup (a record without `userId` is
 * session-keyed and expires).
 */
export function resolveAuthUserId(ctx?: unknown): string | undefined {
  const ctxUserId = userIdOf((ctx as ProfileAuthContext | undefined)?.auth?.user)
  if (ctxUserId) return ctxUserId

  return getMcpRequestInfo()?.authUserId
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
