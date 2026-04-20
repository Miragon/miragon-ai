import { z } from "zod"
import type { Lookup, FieldDef } from "@miragon-ai/client-enrichment"
import { createRestTool } from "@miragon/mcp-toolkit-core/rest"
import type { ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import type { RestClient } from "@miragon/mcp-toolkit-core/rest"

/**
 * Translate a YAML lookup into a `ToolConfig<RestClient>` that the standard
 * registrar can register. Projection (field allow-list) is the only shaping
 * we do here — anything more nuanced belongs in a hand-written tool.
 */
export function buildLookupTool(name: string, lookup: Lookup): ToolConfig<RestClient> {
  return createRestTool({
    name,
    description: lookup.description,
    method: lookup.method,
    path: lookup.path,
    inputSchema: lookup.inputSchema ? fieldsToZodShape(lookup.inputSchema) : undefined,
    projection: lookup.projection ? pickProjection(lookup.projection) : undefined,
    annotations: lookup.annotations,
  })
}

function fieldsToZodShape(fields: Record<string, FieldDef>): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [name, def] of Object.entries(fields)) {
    let schema: z.ZodTypeAny =
      def.type === "string" ? z.string() : def.type === "number" ? z.number() : z.boolean()
    if (def.description) schema = schema.describe(def.description)
    if (def.required === false) schema = schema.optional()
    shape[name] = schema
  }
  return shape
}

function pickProjection(fields: string[]): (raw: unknown) => unknown {
  return (raw) => {
    if (!raw || typeof raw !== "object") return raw
    const src = raw as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const field of fields) {
      if (field in src) out[field] = src[field]
    }
    return out
  }
}
