/**
 * Profile-key resolution for the camunda7 module. The implementation is shared
 * (`@miragon-ai/widget-shell/server`) on purpose: every module reads and writes
 * the SAME profile record, so a module-local copy of this precedence would
 * silently split a user's settings across two keys. This barrel keeps the
 * module's import path stable.
 *
 * @see ANONYMOUS_PROFILE_KEY — the shared fallback record for stdio/tests.
 * @see resolveProfileKey — auth user id > `Mcp-Session-Id` > anonymous > undefined.
 * @see resolveAuthUserId — the auth-only half, stamped onto saved records.
 */
export {
  ANONYMOUS_PROFILE_KEY,
  resolveAuthUserId,
  resolveProfileKey,
  type ProfileAuthContext,
} from "@miragon-ai/widget-shell/server"
