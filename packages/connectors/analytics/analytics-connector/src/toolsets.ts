/**
 * The analytics module's toolset vocabulary. Mirrors the shape of camunda7's
 * `lib/toolsets.ts` (module peers own their own toolset names — only the
 * *semantics* are shared): the suffix in `MCP_ACTIVE_MODULES=analytics:<toolset>`
 * is validated against a declared list, and unknown names fail CLOSED with a
 * warning — they degrade to `read-only`, exactly like `withToolsetFilter`.
 *
 * Analytics reads Prometheus, so every tool is read-only by nature except the
 * settings save — this list exists to gate that one durable write against a
 * name, never against an ad-hoc string comparison that would silently fail open
 * the day a second restrictive toolset is added.
 */
import { createToolsetVocabulary } from "@miragon-ai/widget-shell/server"

export const ANALYTICS_TOOLSETS = ["read-only"] as const
export type AnalyticsToolset = (typeof ANALYTICS_TOOLSETS)[number]

const vocabulary = createToolsetVocabulary("analytics", ANALYTICS_TOOLSETS, "read-only")

export function isAnalyticsToolset(value: string): value is AnalyticsToolset {
  return vocabulary.isKnown(value)
}

/** Toolsets that forbid durable writes (today: the module's only one). */
const READ_ONLY_TOOLSETS: ReadonlySet<AnalyticsToolset> = new Set(["read-only"])

/**
 * Whether the deployment's toolset permits the module's durable writes
 * (`analytics_save_settings`). Registered outside the tool registrar, that save
 * has to gate itself — the registrar's `withToolsetFilter` never sees it.
 *
 * `vocabulary.resolve` carries the shared rule: `undefined` (no toolset
 * configured) allows everything, unknown names warn and degrade to
 * `read-only` — a typo'd restriction must never grant the write it tried to
 * take away.
 */
export function allowsDurableWrites(toolset?: string): boolean {
  const known = vocabulary.resolve(toolset)
  if (known === undefined) return true
  return !READ_ONLY_TOOLSETS.has(known)
}
