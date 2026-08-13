/**
 * Camunda7-owned profile option sets, kept zod-free so widget code can import
 * the runtime arrays (for select option lists) without pulling zod into the UI
 * bundle. The cross-module sets (`LOCALES`, `THEMES`) live in
 * `@miragon-ai/widget-shell` (exported from `/server` AND `/widgets`);
 * `profile-schema.ts` builds its `z.enum(...)` from this one, so the two never
 * drift.
 */

/**
 * Preferred operations role. A profile hint only — actual tool exposure is set
 * at the MCP connection via the `camunda7:read-only|operations|admin` toolset
 * (see `lib/toolsets.ts`); without auth this never gates tools, it only curates
 * UI affordances.
 */
export const ROLES = ["read-only", "operations", "admin"] as const
export type Role = (typeof ROLES)[number]
