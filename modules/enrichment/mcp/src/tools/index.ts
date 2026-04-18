import type { MCPServer } from "mcp-use/server"
import { text, error } from "mcp-use/server"
import type { EnrichmentRuntime } from "@miragon-ai/client-enrichment"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { z } from "zod"

import { autoResolve } from "./auto-resolve.js"
import { buildLookupTool } from "./build-lookup-tool.js"

/**
 * Register one MCP tool per configured lookup (grouped by source so each
 * tool's handler receives the right `RestClient`), plus a single
 * `enrichment_auto_resolve` tool that walks the rule set.
 */
export function registerTools(server: MCPServer, runtime: EnrichmentRuntime): void {
  const { config, clients } = runtime
  const lookupsBySource = groupLookupsBySource(config.lookups)

  for (const [sourceName, lookups] of lookupsBySource) {
    const client = clients[sourceName]
    if (!client) {
      // Lookup references an undefined source — fail loudly so config bugs
      // surface at boot instead of at first call.
      throw new Error(`[enrichment] lookup references unknown source "${sourceName}"`)
    }
    const register = createToolRegistrar(server, client)
    for (const [name, lookup] of lookups) {
      register(buildLookupTool(name, lookup))
    }
  }

  server.tool(
    {
      name: "enrichment_auto_resolve",
      description:
        "Run all enrichment rules against the supplied variables. Returns a structured map of resolved context — one entry per matched variable — plus a list of skipped lookups with reasons.",
      schema: z.object({
        variables: z
          .record(z.string(), z.unknown())
          .describe("Process / task / domain variables keyed by name"),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const result = await autoResolve({ variables: args.variables }, config, clients)
        return text(JSON.stringify(result, null, 2))
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e))
      }
    },
  )
}

function groupLookupsBySource(
  lookups: EnrichmentRuntime["config"]["lookups"],
): Map<string, Array<[string, EnrichmentRuntime["config"]["lookups"][string]]>> {
  const byMap = new Map<string, Array<[string, EnrichmentRuntime["config"]["lookups"][string]]>>()
  for (const [name, lookup] of Object.entries(lookups)) {
    const bucket = byMap.get(lookup.source) ?? []
    bucket.push([name, lookup])
    byMap.set(lookup.source, bucket)
  }
  return byMap
}
