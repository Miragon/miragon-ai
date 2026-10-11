import type { ViewMetaEngines } from "@miragon-ai/widget-shell/widgets"

/**
 * The engine part of an analytics view's meta line (U7) from the result's
 * echo: how many engines the figures add up and, where the result names
 * the reporting ones, how many of them send no metrics. `null` for an
 * unscoped result (every engine Prometheus holds), which names none.
 */
export function enginesMeta(
  engines: readonly string[] | null | undefined,
  reporting?: readonly string[],
): ViewMetaEngines | null {
  if (!engines || engines.length === 0) return null
  return {
    count: engines.length,
    silent: reporting ? engines.filter((id) => !reporting.includes(id)).length : null,
  }
}
