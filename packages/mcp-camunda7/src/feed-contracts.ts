import { z } from "zod"

/**
 * SINGLE SOURCE for the paged feeds' filter contracts. Each filter set used to
 * exist as 3-4 hand-maintained copies with no compile-time link: the feed's
 * zod schema, the show tool's zod schema, the data builder's arg interface,
 * and a widget-side mirror type. The zod shapes here feed both tool schemas
 * (spread into `z.object`), and the `z.infer` types feed the builders and
 * widgets (type-only imports — no runtime zod in widget code paths).
 *
 * Paging args stay separate: `usePagedViewData` owns firstResult/maxResults on
 * the wire, builders default them server-side.
 */

/** Offset paging accepted by every paged `*_data` feed (and its show twin). */
export const pagingShape = {
  firstResult: z.number().int().min(0).optional().describe("Offset for pagination (0-based)."),
  maxResults: z.number().int().positive().optional().describe("Page size."),
}
export type PagingArgs = z.infer<z.ZodObject<typeof pagingShape>>

// ── process instances ─────────────────────────────────────────────────────
export const processInstancesFilterShape = {
  processDefinitionKey: z
    .string()
    .optional()
    .describe(
      "Process definition key whose instances to list. Omit for ALL running instances engine-wide.",
    ),
  active: z.boolean().optional().describe("Only running (non-suspended) instances."),
  suspended: z.boolean().optional().describe("Only suspended instances."),
  withIncidentsOnly: z
    .boolean()
    .optional()
    .describe("Only instances that currently have an open incident."),
  businessKeyLike: z.string().optional().describe("Filter by a substring of the business key."),
}
export type ProcessInstancesFilters = z.infer<z.ZodObject<typeof processInstancesFilterShape>>

// ── jobs ──────────────────────────────────────────────────────────────────
export const jobsFilterShape = {
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  failedOnly: z.boolean().optional().describe("Show only failed jobs (no retries left)"),
}
export type JobsFilters = z.infer<z.ZodObject<typeof jobsFilterShape>>

// ── failure cluster detail ────────────────────────────────────────────────
export const clusterDetailFilterShape = {
  activityId: z.string().describe("Activity id of the failure cluster."),
  incidentType: z.string().describe('Incident type of the cluster, e.g. "failedJob".'),
  messageSignature: z
    .string()
    .optional()
    .describe(
      "Normalized failure-message signature (as produced by the engine-health clusters). Omitted → all messages for this activity + type.",
    ),
  businessKeyLike: z
    .string()
    .optional()
    .describe("Narrow the affected-instance list by a business-key substring."),
}
export type ClusterDetailFilters = z.infer<z.ZodObject<typeof clusterDetailFilterShape>>

// ── per-activity incident rows ────────────────────────────────────────────
export const activityIncidentsFilterShape = {
  processDefinitionKey: z.string().describe("Process definition key"),
  activityId: z.string().describe("Activity id whose incidents to page"),
}
export type ActivityIncidentsFilters = z.infer<z.ZodObject<typeof activityIncidentsFilterShape>>

// ── process definitions list ──────────────────────────────────────────────
export const processListFilterShape = {
  key: z.string().optional().describe("Filter by exact process definition key"),
  nameLike: z.string().optional().describe("Filter by name (substring match)"),
  latestVersion: z.boolean().optional().describe("Only return latest versions"),
}
export type ProcessListFilters = z.infer<z.ZodObject<typeof processListFilterShape>>
