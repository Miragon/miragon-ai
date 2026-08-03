/**
 * The analytics module's toolset vocabulary. Mirrors the shape of camunda7's
 * `lib/toolsets.ts` (module peers own their own toolset names — only the
 * *semantics* are shared): the suffix in `MCP_ACTIVE_MODULES=analytics:<toolset>`
 * is validated against a declared list, and unknown names fail OPEN with a
 * warning, exactly like `withToolsetFilter`.
 *
 * Analytics reads Prometheus, so every tool is read-only by nature except the
 * settings save — this list exists to gate that one durable write against a
 * name, never against an ad-hoc string comparison that would silently fail open
 * the day a second restrictive toolset is added.
 */
export const ANALYTICS_TOOLSETS = ["read-only"] as const
export type AnalyticsToolset = (typeof ANALYTICS_TOOLSETS)[number]

export function isAnalyticsToolset(value: string): value is AnalyticsToolset {
  return (ANALYTICS_TOOLSETS as readonly string[]).includes(value)
}

/** Toolsets that forbid durable writes (today: the module's only one). */
const READ_ONLY_TOOLSETS: ReadonlySet<AnalyticsToolset> = new Set(["read-only"])

/**
 * Whether the deployment's toolset permits the module's durable writes
 * (`analytics_save_settings`). Registered outside the tool registrar, that save
 * has to gate itself — the registrar's `withToolsetFilter` never sees it.
 *
 * `undefined` (no toolset configured) and unknown names register everything,
 * consistent with the server's `MCP_ACTIVE_MODULES` semantics for unknown
 * modules.
 */
export function allowsDurableWrites(toolset?: string): boolean {
  if (toolset === undefined) return true
  if (!isAnalyticsToolset(toolset)) {
    console.warn(
      `[mcp-analytics] Unknown toolset "${toolset}" — exposing all tools. ` +
        `Known toolsets: ${ANALYTICS_TOOLSETS.join(", ")}`,
    )
    return true
  }
  return !READ_ONLY_TOOLSETS.has(toolset)
}
