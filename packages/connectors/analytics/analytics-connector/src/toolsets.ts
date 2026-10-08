/**
 * The analytics module's toolset vocabulary. Module peers own their toolset
 * NAMES; the fail-closed SEMANTICS are shared (`createToolsetVocabulary` from
 * `@miragon-ai/widget-shell/server`):
 *
 * - `read-only` — the floor: every analytics read, no durable write (the
 *   settings save tool is not registered);
 * - `standard` — the full analytics surface, including the caller's own
 *   settings save. Analytics has no admin tier: it reads Prometheus and never
 *   writes to an engine, so there is nothing wider to name.
 *
 * Which one a boot runs with (`MCP_ACTIVE_MODULES=analytics:<toolset>`):
 *
 * - no suffix → `read-only` on an unauthenticated boot, `standard` when the
 *   root installed OAuth;
 * - an empty or unknown suffix → warns and degrades to `read-only` — a suffix
 *   always meant to restrict, so a typo never grants the write it tried to
 *   take away;
 * - nothing ever resolves to "everything".
 *
 * The composition root resolves the suffix once per boot and hands the module
 * a concrete name; a direct `createPlugin` caller that passes none gets the
 * floor.
 */
import { createToolsetVocabulary } from "@miragon-ai/widget-shell/server"

export const ANALYTICS_TOOLSETS = ["read-only", "standard"] as const
export type AnalyticsToolset = (typeof ANALYTICS_TOOLSETS)[number]

/** The vocabulary the module declares to the composition root (`analyticsModule.toolsets`). */
export const analyticsToolsets = createToolsetVocabulary(
  "analytics",
  ANALYTICS_TOOLSETS,
  "read-only",
  {
    authenticatedDefault: "standard",
  },
)

export function isAnalyticsToolset(value: string): value is AnalyticsToolset {
  return analyticsToolsets.isKnown(value)
}

/**
 * Whether the toolset permits the module's durable writes
 * (`analytics_save_settings`). Registered outside the tool registrar, that save
 * has to gate itself — no registrar filter ever sees it.
 *
 * Decided by the vocabulary, never by an ad-hoc `toolset === "read-only"`
 * compare (which fails open for every other name): a missing toolset resolves
 * to the read-only floor, an unknown one warns and degrades to it, and only a
 * toolset above the floor (`standard`) writes.
 */
export function allowsDurableWrites(toolset?: string): boolean {
  return analyticsToolsets.allowsDurableWrites(analyticsToolsets.resolve(toolset))
}
