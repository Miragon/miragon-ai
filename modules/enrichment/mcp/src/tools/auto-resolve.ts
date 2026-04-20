import type { EnrichmentConfig, EnrichmentRule } from "@miragon-ai/client-enrichment"
import type { RestClient } from "@miragon/mcp-toolkit-core/rest"

import { buildLookupTool } from "./build-lookup-tool.js"

export interface AutoResolveInput {
  variables: Record<string, unknown>
}

export interface AutoResolveResult {
  resolved: Record<string, unknown[]>
  skipped: Array<{ variable: string; reason: string }>
}

/**
 * Walk the configured rules and, for every input variable that matches a
 * rule by exact name, run each listed lookup against the appropriate source
 * client. The `$value` placeholder in a lookup's `with` map is substituted
 * with the variable's value; every other value is passed through literally.
 *
 * Lookup failures (HTTP errors) do **not** abort the whole resolution — they
 * are recorded in `skipped` so the caller can still act on the results that
 * did come back.
 */
export async function autoResolve(
  input: AutoResolveInput,
  config: EnrichmentConfig,
  clients: Record<string, RestClient>,
): Promise<AutoResolveResult> {
  const resolved: Record<string, unknown[]> = {}
  const skipped: AutoResolveResult["skipped"] = []

  for (const rule of config.enrichment_rules) {
    if (!(rule.whenVariable in input.variables)) continue
    const variableValue = input.variables[rule.whenVariable]
    const results: unknown[] = []

    for (const step of rule.resolve) {
      const lookup = config.lookups[step.lookup]
      if (!lookup) {
        skipped.push({ variable: rule.whenVariable, reason: `lookup "${step.lookup}" not defined` })
        continue
      }
      const client = clients[lookup.source]
      if (!client) {
        skipped.push({
          variable: rule.whenVariable,
          reason: `source "${lookup.source}" for lookup "${step.lookup}" not configured`,
        })
        continue
      }

      const boundArgs = bindArgs(step.with, variableValue)
      try {
        const tool = buildLookupTool(step.lookup, lookup)
        const result = await tool.handler(client, boundArgs)
        results.push({ lookup: step.lookup, result })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        skipped.push({
          variable: rule.whenVariable,
          reason: `lookup "${step.lookup}" failed: ${message}`,
        })
      }
    }

    if (results.length > 0) resolved[rule.whenVariable] = results
  }

  return { resolved, skipped }
}

function bindArgs(template: Record<string, string>, value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(template)) {
    out[key] = raw === "$value" ? value : raw
  }
  return out
}

/** Exposed for tests to exercise rule application without a full plugin. */
export function rulesForVariable(variableName: string, rules: EnrichmentRule[]): EnrichmentRule[] {
  return rules.filter((r) => r.whenVariable === variableName)
}
