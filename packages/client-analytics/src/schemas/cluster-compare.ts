import { z } from "zod"
import { engineFilterShape } from "./shared.js"

export const clusterCompareInput = z.object({
  processDefinitionKey: z
    .string()
    .optional()
    .describe("Restrict to a single process definition (optional)"),
  elementId: z
    .string()
    .optional()
    .describe("Restrict incident count to a single BPMN element (optional)"),
  deploymentTimestamp: z
    .string()
    .min(1)
    .describe("Deployment timestamp (ISO datetime). Pulled from camunda7_get_deployment."),
  windowBeforeDays: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(7)
    .describe("Window size before the deployment, in days (max 30 — Prometheus retention)"),
  windowAfterDays: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(7)
    .describe("Window size after the deployment, in days (max 30 — Prometheus retention)"),
  minBucketSize: z
    .number()
    .int()
    .min(1)
    .default(10)
    .describe("Minimum instance count per window before results are trusted"),
  ...engineFilterShape,
})
