import { z } from "zod"

/**
 * Tenant enrichment config — a YAML-serialisable shape that declares REST
 * upstreams (`sources`), domain-specific lookups (`lookups`), and
 * auto-resolution rules (`enrichment_rules`).
 *
 * Secrets are referenced by environment variable name (`tokenEnv`,
 * `valueEnv`) rather than embedded in the YAML, so the file itself is safe
 * to check in alongside tenant-specific configuration.
 */

const sourceAuthSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("bearer"), tokenEnv: z.string() }),
  z.object({
    mode: z.literal("header"),
    headerName: z.string(),
    valueEnv: z.string(),
  }),
])

const sourceSchema = z.object({
  baseUrl: z.string().url(),
  auth: sourceAuthSchema.optional(),
  defaultHeaders: z.record(z.string(), z.string()).optional(),
})

const fieldTypeSchema = z.enum(["string", "number", "boolean"])

const fieldSchema = z.object({
  type: fieldTypeSchema,
  required: z.boolean().optional().default(true),
  description: z.string().optional(),
})

const lookupSchema = z.object({
  source: z.string(),
  description: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  path: z.string(),
  inputSchema: z.record(z.string(), fieldSchema).optional(),
  /**
   * Optional list of top-level field names to keep from the response. If
   * omitted, the full response is returned to the LLM.
   */
  projection: z.array(z.string()).optional(),
  annotations: z
    .object({
      readOnlyHint: z.boolean().optional(),
      destructiveHint: z.boolean().optional(),
      idempotentHint: z.boolean().optional(),
      openWorldHint: z.boolean().optional(),
    })
    .optional(),
})

const enrichmentRuleSchema = z.object({
  /** Match a top-level variable by exact name. */
  whenVariable: z.string(),
  resolve: z
    .array(
      z.object({
        lookup: z.string(),
        /**
         * Arg bindings for the lookup. `"$value"` is replaced with the
         * matched variable's value; other strings are taken literally.
         */
        with: z.record(z.string(), z.string()),
      }),
    )
    .min(1),
})

export const enrichmentConfigSchema = z.object({
  sources: z.record(z.string(), sourceSchema),
  lookups: z.record(z.string(), lookupSchema),
  enrichment_rules: z.array(enrichmentRuleSchema).default([]),
})

export type EnrichmentConfig = z.infer<typeof enrichmentConfigSchema>
export type Source = z.infer<typeof sourceSchema>
export type Lookup = z.infer<typeof lookupSchema>
export type EnrichmentRule = z.infer<typeof enrichmentRuleSchema>
export type FieldDef = z.infer<typeof fieldSchema>
