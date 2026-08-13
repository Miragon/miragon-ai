import {
  createLocalizeFor,
  resolveAuthUserId,
  resolveProfileKey,
} from "@miragon-ai/widget-shell/server"
import { translator } from "./messages/index.js"

/**
 * The profile port + key resolution come from the shared server kit, NOT from a
 * module-local copy: every module reads and writes the same profile record, so
 * a divergent key precedence (or a differently-spelled anonymous fallback)
 * would silently split a user's settings across two records. Re-exported under
 * this module's names so the call sites read in analytics vocabulary.
 *
 * `ProfileSource` is the minimal read/write view a module needs — the locale
 * plus its own slice under `modules.analytics`. camunda7's `ProfileStore`
 * satisfies it structurally, without analytics depending on the camunda7
 * module; `save` merges per module key on the store side, so writing
 * `modules.analytics` never touches other modules' slices.
 */
export type { ProfileSlice, ProfileSource } from "@miragon-ai/widget-shell/server"

/**
 * Resolve the profile key for the in-flight request: the authenticated user id
 * (off the tool-handler `ctx`, or off the ambient request info for handlers
 * without a `ctx`), else the MCP session id (a gateway-stamped
 * `Mcp-Session-Id` — mcp-use 2 issues none itself), else the shared anonymous
 * record when there is NO request context at all (stdio, tests). An HTTP
 * request without any identity resolves `undefined` — reads fall back to
 * defaults, saves fail visibly, so unrelated keyless clients never cross-share
 * one record.
 */
export const resolveSettingsKey = resolveProfileKey

/**
 * Just the authenticated-user half of {@link resolveSettingsKey} — the save
 * path stamps it onto the record (`opts.userId`), marking it user-bound and
 * exempt from the app's session-TTL cleanup.
 */
export const resolveSettingsAuthUserId = resolveAuthUserId

/** A locale-bound translate for analytics server summaries. */
export type { ServerT } from "@miragon-ai/widget-shell/server"

/**
 * Resolve the request locale and return a translate bound to it + the analytics
 * catalogs — `const t = await localizeFor(store, ctx); … summary: t("key", { … })`.
 * Pass the tool-handler `ctx` so an auth user id resolves the same record the
 * save path writes. Locale resolution + the fail-soft rules (no store, no key,
 * store OUTAGE → English) come from the shared `createLocalizeFor`.
 */
export const localizeFor = createLocalizeFor(translator)
