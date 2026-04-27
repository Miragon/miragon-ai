import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { buildSingleWidgetView } from "@miragon-ai/widget-shell/server"
import {
  escapeString,
  queries,
  type ClickHouseClient,
  type AnalyticsDashboardData,
  type ActivityBreakdownItem,
  type DefinitionBreakdownItem,
  type FailureDashboardData,
  type ErrorPatternItem,
  type ProcessFailureItem,
  type VariableSearchData,
  type ExecutionTraceData,
  type VariableSearchRow,
  type PathFrequencyData,
} from "@miragon-ai/client-analytics"
import type { Client as Camunda7Client } from "@miragon-ai/client-cibseven"
import { getProcessDefinitionBpmn20XmlByKey } from "@miragon-ai/client-cibseven/generated/sdk.gen"

export interface AnalyticsWidgetToolsOptions {
  camunda7Client?: Camunda7Client
}

export function registerWidgetTools(
  server: MCPServer,
  ch: ClickHouseClient,
  resourceUri: string,
  options: AnalyticsWidgetToolsOptions = {},
) {
  const camunda7Client = options.camunda7Client
  server.tool(
    {
      name: "analytics_show_dashboard",
      title: "Process Analytics Dashboard",
      description:
        "Show aggregated process metrics and KPIs from ClickHouse analytics with activity bottleneck breakdown.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        processDefinitionKey: z.string().optional(),
        period: z.enum(["1d", "7d", "30d", "90d"]).default("7d"),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const interval = {
        "1d": "1 DAY",
        "7d": "7 DAY",
        "30d": "30 DAY",
        "90d": "90 DAY",
      }[args.period]

      const keyFilter = args.processDefinitionKey
        ? `AND process_definition_key = ${escapeString(args.processDefinitionKey)}`
        : ""

      const kpiSql = `
SELECT
    count() AS total_instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'ACTIVE') AS running,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct,
    round(avgIf(dateDiff('millisecond', start_time, end_time), state = 'COMPLETED' AND end_time IS NOT NULL) / 1000, 1) AS avg_duration_sec,
    round(quantileIf(0.5)(dateDiff('millisecond', start_time, end_time), state = 'COMPLETED' AND end_time IS NOT NULL) / 1000, 1) AS median_duration_sec,
    round(quantileIf(0.95)(dateDiff('millisecond', start_time, end_time), state = 'COMPLETED' AND end_time IS NOT NULL) / 1000, 1) AS p95_duration_sec
FROM (
    SELECT
        id,
        any(process_definition_key) AS process_definition_key,
        argMax(state, timestamp) AS state,
        min(start_time) AS start_time,
        max(end_time) AS end_time
    FROM camunda_history.camunda_process_instances
    GROUP BY id
) sub
WHERE start_time >= now() - INTERVAL ${interval}
    ${keyFilter}`

      const incidentSql = `
SELECT count() AS incident_count
FROM camunda_history.camunda_incidents FINAL
WHERE end_time IS NULL
    AND create_time >= now() - INTERVAL ${interval}
    ${args.processDefinitionKey ? `AND process_definition_key = ${escapeString(args.processDefinitionKey)}` : ""}`

      const activitySql = `
SELECT
    activity_id,
    activity_name,
    activity_type,
    count() AS execution_count,
    round(avg(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.95)(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS p95_duration_sec,
    round(sum(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS total_time_sec
FROM (
    SELECT
        id,
        any(activity_id) AS activity_id,
        any(activity_name) AS activity_name,
        any(activity_type) AS activity_type,
        any(process_definition_key) AS process_definition_key,
        min(start_time) AS start_time,
        max(end_time) AS end_time
    FROM camunda_history.camunda_activity_instances
    GROUP BY id
) sub
WHERE end_time IS NOT NULL
    AND start_time >= now() - INTERVAL ${interval}
    ${args.processDefinitionKey ? `AND process_definition_key = ${escapeString(args.processDefinitionKey)}` : ""}
GROUP BY activity_id, activity_name, activity_type
ORDER BY total_time_sec DESC
LIMIT 20`

      const definitionSql = `
SELECT
    process_definition_key,
    count() AS total_instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'ACTIVE') AS running,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(avgIf(dateDiff('millisecond', start_time, end_time), state = 'COMPLETED' AND end_time IS NOT NULL), 0) AS avg_duration_ms
FROM (
    SELECT
        id,
        any(process_definition_key) AS process_definition_key,
        argMax(state, timestamp) AS state,
        min(start_time) AS start_time,
        max(end_time) AS end_time
    FROM camunda_history.camunda_process_instances
    GROUP BY id
) sub
WHERE start_time >= now() - INTERVAL ${interval}
    ${keyFilter}
GROUP BY process_definition_key
ORDER BY total_instances DESC`

      interface DashboardKpiRow {
        total_instances: number
        completed: number
        running: number
        failed: number
        failure_rate_pct: number
        avg_duration_sec: number | null
        median_duration_sec: number | null
        p95_duration_sec: number | null
      }
      interface ActivityDashboardRow {
        activity_id: string
        activity_name: string | null
        activity_type: string
        execution_count: number
        avg_duration_sec: number | null
        p95_duration_sec: number | null
        total_time_sec: number | null
      }
      interface DefinitionDashboardRow {
        process_definition_key: string
        total_instances: number
        completed: number
        running: number
        failed: number
        avg_duration_ms: number | null
      }

      const [kpiRows, incidentRows, activityBreakdown, definitionBreakdown] = await Promise.all([
        ch.query<DashboardKpiRow>(kpiSql),
        ch.query<{ incident_count: number }>(incidentSql),
        ch.query<ActivityDashboardRow>(activitySql),
        ch.query<DefinitionDashboardRow>(definitionSql),
      ])

      const kpi = kpiRows[0]

      const activityItems: ActivityBreakdownItem[] = activityBreakdown.map((a) => ({
        activityId: a.activity_id,
        activityName: a.activity_name ?? "",
        activityType: a.activity_type,
        executionCount: Number(a.execution_count),
        avgDurationMs: Number(a.avg_duration_sec ?? 0) * 1000,
        p95DurationMs: Number(a.p95_duration_sec ?? 0) * 1000,
        totalTimeMs: Number(a.total_time_sec ?? 0) * 1000,
      }))

      const definitionItems: DefinitionBreakdownItem[] = definitionBreakdown.map((d) => ({
        processDefinitionKey: d.process_definition_key,
        totalInstances: Number(d.total_instances),
        completed: Number(d.completed),
        running: Number(d.running),
        failed: Number(d.failed),
        avgDurationMs: d.avg_duration_ms != null ? Number(d.avg_duration_ms) : null,
      }))

      const data: AnalyticsDashboardData = {
        totalCount: Number(kpi?.total_instances ?? 0),
        completedCount: Number(kpi?.completed ?? 0),
        runningCount: Number(kpi?.running ?? 0),
        failedCount: Number(kpi?.failed ?? 0),
        incidentCount: Number(incidentRows[0]?.incident_count ?? 0),
        failureRatePct: Number(kpi?.failure_rate_pct ?? 0),
        avgDurationMs: kpi?.avg_duration_sec != null ? Number(kpi.avg_duration_sec) * 1000 : null,
        medianDurationMs:
          kpi?.median_duration_sec != null ? Number(kpi.median_duration_sec) * 1000 : null,
        p95DurationMs: kpi?.p95_duration_sec != null ? Number(kpi.p95_duration_sec) * 1000 : null,
        activityBreakdown: activityItems,
        definitionBreakdown: definitionItems,
      }

      return buildSingleWidgetView({
        widget: "analytics:dashboard",
        app: "analytics",
        dataType: "analytics:dashboard",
        data,
        title: "Analytics Dashboard",
      })
    },
  )

  // --- Failure Dashboard ---
  server.tool(
    {
      name: "analytics_show_failure_dashboard",
      title: "Failure Analysis Dashboard",
      description:
        "Show error patterns and failure analysis across process instances, grouped by error message and process definition.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        period: z.enum(["1d", "7d", "30d", "90d"]).default("7d"),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const interval = {
        "1d": "1 DAY",
        "7d": "7 DAY",
        "30d": "30 DAY",
        "90d": "90 DAY",
      }[args.period]

      const errorPatternsSql = `
SELECT
    incident_message,
    activity_id,
    process_definition_key,
    count() AS incident_count,
    min(create_time) AS first_occurrence,
    max(create_time) AS last_occurrence,
    groupArray(10)(process_instance_id) AS sample_instance_ids
FROM camunda_history.camunda_incidents FINAL
WHERE create_time >= now() - INTERVAL ${interval}
GROUP BY incident_message, activity_id, process_definition_key
ORDER BY incident_count DESC
LIMIT 50`

      const processFailuresSql = `
SELECT
    process_definition_key,
    count() AS total_instances,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed_count,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct
FROM (
    SELECT
        id,
        any(process_definition_key) AS process_definition_key,
        argMax(state, timestamp) AS state,
        min(start_time) AS start_time
    FROM camunda_history.camunda_process_instances
    GROUP BY id
) sub
WHERE start_time >= now() - INTERVAL ${interval}
GROUP BY process_definition_key
HAVING failed_count > 0
ORDER BY failed_count DESC`

      const incidentsByProcessSql = `
SELECT
    process_definition_key,
    count() AS incident_count
FROM camunda_history.camunda_incidents FINAL
WHERE create_time >= now() - INTERVAL ${interval}
GROUP BY process_definition_key`

      interface ErrorPatternQueryRow {
        incident_message: string | null
        activity_id: string | null
        process_definition_key: string | null
        incident_count: number
        first_occurrence: string | null
        last_occurrence: string | null
        sample_instance_ids: string[] | null
      }
      interface ProcessFailureQueryRow {
        process_definition_key: string
        total_instances: number
        failed_count: number
        failure_rate_pct: number
      }

      const [errorPatterns, processFailures, incidentsByProcess] = await Promise.all([
        ch.query<ErrorPatternQueryRow>(errorPatternsSql),
        ch.query<ProcessFailureQueryRow>(processFailuresSql),
        ch.query<{ process_definition_key: string; incident_count: number }>(incidentsByProcessSql),
      ])

      const incidentMap = new Map<string, number>()
      for (const row of incidentsByProcess) {
        incidentMap.set(row.process_definition_key, Number(row.incident_count))
      }

      const totalIncidents = errorPatterns.reduce((s, r) => s + Number(r.incident_count ?? 0), 0)

      const processBreakdown: ProcessFailureItem[] = processFailures.map((p) => ({
        processDefinitionKey: p.process_definition_key,
        totalInstances: Number(p.total_instances),
        failedCount: Number(p.failed_count),
        incidentCount: incidentMap.get(p.process_definition_key) ?? 0,
        failureRatePct: Number(p.failure_rate_pct),
      }))

      const mostAffectedProcess =
        processBreakdown.length > 0 ? processBreakdown[0].processDefinitionKey : null

      const errorPatternItems: ErrorPatternItem[] = errorPatterns.map((r) => ({
        incidentMessage: r.incident_message ?? "",
        activityId: r.activity_id ?? "",
        processDefinitionKey: r.process_definition_key ?? "",
        incidentCount: Number(r.incident_count),
        firstOccurrence: r.first_occurrence ?? "",
        lastOccurrence: r.last_occurrence ?? "",
        sampleInstanceIds: Array.isArray(r.sample_instance_ids) ? r.sample_instance_ids : [],
      }))

      const data: FailureDashboardData = {
        totalIncidents,
        uniqueErrorPatterns: errorPatterns.length,
        mostAffectedProcess,
        period: args.period,
        errorPatterns: errorPatternItems,
        processBreakdown,
      }

      return buildSingleWidgetView({
        widget: "analytics:failure-dashboard",
        app: "analytics",
        dataType: "analytics:failureDashboard",
        data,
        title: "Failure Dashboard",
      })
    },
  )

  // --- Variable Search ---
  server.tool(
    {
      name: "analytics_show_variable_search",
      title: "Variable Search",
      description:
        "Show interactive search panel for finding process instances by variable values (e.g. orderId, customerId).",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        variableName: z.string().optional().describe("Pre-fill variable name"),
        variableValue: z.string().optional().describe("Pre-fill variable value"),
        processDefinitionKey: z
          .string()
          .optional()
          .describe("Pre-fill process definition key filter"),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      let results: VariableSearchRow[] | null = null

      if (args.variableName && args.variableValue) {
        const conditions = [
          `v.variable_name = ${escapeString(args.variableName)}`,
          `v.text_value = ${escapeString(args.variableValue)}`,
        ]
        if (args.processDefinitionKey) {
          conditions.push(`p.process_definition_key = ${escapeString(args.processDefinitionKey)}`)
        }
        const sql = `
SELECT DISTINCT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.business_key,
    argMax(p.state, p.timestamp) AS state,
    min(p.start_time) AS start_time,
    max(p.end_time) AS end_time,
    max(p.duration_in_millis) AS duration_in_millis,
    v.variable_name,
    v.text_value
FROM (SELECT * FROM camunda_history.camunda_variable_updates FINAL) v
JOIN camunda_history.camunda_process_instances p ON p.id = v.process_instance_id
WHERE ${conditions.join(" AND ")}
GROUP BY p.id, p.process_definition_key, p.business_key, v.variable_name, v.text_value
ORDER BY start_time DESC
LIMIT 50`
        results = await ch.query<VariableSearchRow>(sql)
      }

      const data: VariableSearchData = {
        results,
        searchParams:
          args.variableName || args.variableValue
            ? {
                variableName: args.variableName ?? "",
                variableValue: args.variableValue ?? "",
                processDefinitionKey: args.processDefinitionKey,
              }
            : null,
      }

      return buildSingleWidgetView({
        widget: "analytics:variable-search",
        app: "analytics",
        dataType: "analytics:variableSearch",
        data,
        title: "Variable Search",
      })
    },
  )

  // --- Execution Trace ---
  server.tool(
    {
      name: "analytics_show_execution_trace",
      title: "Execution Trace",
      description:
        "Show end-to-end execution trace for a process instance with activity history, variable changes, and OTEL spans.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        processInstanceId: z
          .string()
          .optional()
          .describe("Process instance ID to trace (can be entered in widget)"),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      let trace: ExecutionTraceData["trace"] = null

      if (args.processInstanceId) {
        const pid = escapeString(args.processInstanceId)
        trace = {}

        const actSql = `
SELECT
    activity_id,
    activity_name,
    activity_type,
    start_time,
    end_time,
    duration_in_millis,
    assignee,
    task_id
FROM camunda_history.camunda_activity_instances
WHERE process_instance_id = ${pid}
ORDER BY start_time ASC`
        trace.activityHistory = await ch.query(actSql)

        const varSql = `
SELECT
    variable_name,
    variable_type,
    text_value,
    long_value,
    double_value,
    revision,
    timestamp
FROM camunda_history.camunda_variable_updates FINAL
WHERE process_instance_id = ${pid}
ORDER BY timestamp ASC`
        trace.variableChanges = await ch.query(varSql)

        const otelSql = `
SELECT
    t.TraceId,
    t.SpanName,
    t.ServiceName,
    t.Duration / 1000000 AS duration_ms,
    t.StatusCode,
    t.StatusMessage
FROM otel.otel_traces t
JOIN camunda_history.camunda_process_instances p ON t.TraceId = p.trace_id
WHERE p.id = ${pid}
ORDER BY t.Timestamp`
        try {
          trace.otelSpans = await ch.query(otelSql)
        } catch {
          trace.otelSpans = []
          trace.otelSpansError = "OTEL traces not available (otel database may not exist)"
        }
      }

      const data: ExecutionTraceData = {
        processInstanceId: args.processInstanceId ?? null,
        trace,
      }

      return buildSingleWidgetView({
        widget: "analytics:execution-trace",
        app: "analytics",
        dataType: "analytics:executionTrace",
        data,
        title: "Execution Trace",
      })
    },
  )

  // --- Path Frequency (Sankey) ---
  server.tool(
    {
      name: "analytics_show_path_frequency",
      title: "Path Frequency (Sankey)",
      description:
        "Visualize the most frequent activity paths through a process definition as a Sankey-style flow diagram. Min-bucket aggregation prevents leakage of rare executions. Pass `version` to scope the diagram to one deployed version — pair with analytics_show_version_compare to render per-version flow side-by-side.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        processDefinitionKey: z.string(),
        period: z.enum(["1d", "7d", "30d", "90d"]).default("7d"),
        minBucketSize: z.number().int().min(1).default(10),
        limit: z.number().int().min(1).max(50).default(20),
        version: z.number().int().min(1).optional(),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const result = await queries.pathFrequency(ch, args)

      let bpmnXml: string | null = null
      if (camunda7Client) {
        const xmlResp = (await getProcessDefinitionBpmn20XmlByKey({
          client: camunda7Client,
          path: { key: args.processDefinitionKey },
        }).catch(() => null)) as { bpmn20Xml?: string } | null
        bpmnXml = xmlResp?.bpmn20Xml ?? null
      }

      const data: PathFrequencyData = {
        ...result,
        processDefinitionKey: args.processDefinitionKey,
        bpmnXml,
      }

      return buildSingleWidgetView({
        widget: "analytics:path-frequency",
        app: "analytics",
        dataType: "analytics:pathFrequency",
        data,
        title: "Path Frequency",
      })
    },
  )

  // --- Cluster Compare (Pre/Post deployment diff) ---
  server.tool(
    {
      name: "analytics_show_cluster_compare",
      title: "Pre/Post Deployment Comparison",
      description:
        "Visualize before/after KPI deltas around a deployment timestamp. Results are flagged `suppressed` when either window has fewer than minBucketSize instances.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        processDefinitionKey: z.string().optional(),
        elementId: z.string().optional(),
        deploymentTimestamp: z.string().min(1),
        windowBeforeDays: z.number().int().min(1).max(90).default(7),
        windowAfterDays: z.number().int().min(1).max(90).default(7),
        minBucketSize: z.number().int().min(1).default(10),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const data = await queries.clusterCompare(ch, args)
      return buildSingleWidgetView({
        widget: "analytics:cluster-compare",
        app: "analytics",
        dataType: "analytics:clusterCompare",
        data,
        title: "Cluster Compare",
      })
    },
  )

  // --- Version Compare (v1 vs v2 of one process) ---
  server.tool(
    {
      name: "analytics_show_version_compare",
      title: "Process Version Comparison",
      description:
        "Visualize KPI deltas between two deployed versions of the same processDefinitionKey within a shared time window. Results are flagged `suppressed` when either version has fewer than minBucketSize instances.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        processDefinitionKey: z.string().min(1),
        versionA: z.number().int().min(1),
        versionB: z.number().int().min(1),
        windowDays: z.number().int().min(1).max(90).default(30),
        elementId: z.string().optional(),
        minBucketSize: z.number().int().min(1).default(10),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const data = await queries.versionCompare(ch, args)
      return buildSingleWidgetView({
        widget: "analytics:version-compare",
        app: "analytics",
        dataType: "analytics:versionCompare",
        data,
        title: "Version Compare",
      })
    },
  )
}
