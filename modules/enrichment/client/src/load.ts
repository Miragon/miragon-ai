import fs from "node:fs/promises"
import { parse as parseYaml } from "yaml"

import { enrichmentConfigSchema, type EnrichmentConfig } from "./schema.js"

/**
 * Parse and validate an enrichment YAML string.
 *
 * Throws a zod validation error with a readable path when the shape is
 * wrong — caller decides whether to surface or swallow.
 */
export function parseEnrichmentConfig(yaml: string): EnrichmentConfig {
  const raw: unknown = parseYaml(yaml)
  return enrichmentConfigSchema.parse(raw)
}

export async function loadEnrichmentConfigFromFile(path: string): Promise<EnrichmentConfig> {
  const contents = await fs.readFile(path, "utf-8")
  return parseEnrichmentConfig(contents)
}
