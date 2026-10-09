import { z } from "zod"
import { engineFilterShape } from "./shared.js"

export const versionCompareInput = z.object({
  processDefinitionKey: z
    .string()
    .min(1)
    .describe("Process definition key — versions are only meaningful within a single key."),
  versionA: z.number().int().min(1).describe("First process definition version (the baseline)."),
  versionB: z.number().int().min(1).describe("Second process definition version (the candidate)."),
  windowDays: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(14)
    .describe(
      "Look-back window applied to both versions, in days (max 30 — Prometheus retention).",
    ),
  elementId: z
    .string()
    .optional()
    .describe(
      "Currently has no effect: it only scopes the incident KPIs, which are unavailable per version (the incident metric carries no version label). Accepted for compatibility.",
    ),
  minBucketSize: z
    .number()
    .int()
    .min(1)
    .default(10)
    .describe("Minimum instance count per version before results are trusted."),
  ...engineFilterShape,
})
