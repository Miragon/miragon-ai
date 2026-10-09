/**
 * Profile-key resolution for the camunda7 module. The implementation is shared
 * (`@miragon-ai/widget-shell/server`) on purpose: every module reads and writes
 * the SAME profile record, so a module-local copy of this precedence would
 * silently split a user's settings across two keys. This barrel keeps the
 * module's import path stable.
 *
 * @see resolveProfileKey — OAuth caller > declared local caller (`anonymous`) > undefined.
 * @see resolveAuthUserId — the OAuth half, stamped onto saved records as their owner.
 */
export { resolveAuthUserId, resolveProfileKey } from "@miragon-ai/widget-shell/server"
