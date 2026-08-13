import { z } from "zod"
import {
  appOnly,
  buildDataFeedResult,
  buildSingleWidgetView,
  showToolBinding,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import { queries, schemas } from "@miragon-ai/analytics-client"
import { ANALYTICS_ENGINE_LANDSCAPE_DATA } from "../tool-names.js"
import { localizeFor } from "../server-locale.js"
import { optionalMinBucketSize, settingsFor } from "../settings.js"
import { compareDeltaSummary, suppressedNote, type AnalyticsWidgetToolsContext } from "./shared.js"

/**
 * The comparison family plus the cross-engine landscape they hang off.
 *
 * The three compare views answer "did this get worse?" along one axis at a
 * time — across a deployment (cluster), across two versions of a process
 * (version), across two engines running the SAME process (engine). The
 * landscape is deliberately not a fourth comparison: engines host different
 * process mixes, so it reports what runs where plus mix-independent signals
 * and names the definitions for which an engine comparison actually holds.
 */
export function registerComparisonWidgetTools(ctx: AnalyticsWidgetToolsContext) {
  const { server, ch, profileStore } = ctx

  // --- Cluster Compare (Pre/Post deployment diff) ---
  server.tool(
    {
      name: "analytics_show_cluster_compare",
      title: "Pre/Post Deployment Comparison",
      description:
        "Visualize before/after KPI deltas around a deployment timestamp. Results are flagged `suppressed` when either window has fewer than minBucketSize instances.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...schemas.clusterCompareInput.shape,
        minBucketSize: optionalMinBucketSize,
      }),
      ...showToolBinding("analytics_show_cluster_compare", "Pre/Post Deployment Comparison"),
    },
    withToolErrors(async (args, toolCtx) => {
      const t = await localizeFor(profileStore, toolCtx)
      const minBucketSize =
        args.minBucketSize ?? (await settingsFor(profileStore, toolCtx)).minBucketSize
      const data = await queries.clusterCompare(ch, { ...args, minBucketSize })
      return buildSingleWidgetView({
        widget: "analytics:cluster-compare",
        app: "analytics",
        dataType: "analytics:clusterCompare",
        data,
        title: "Cluster Compare",
        summary: t("aSum.clusterCompare", {
          scope: data.processDefinitionKey
            ? t("aSum.scopeForProcess", { key: data.processDefinitionKey })
            : "",
          deploymentTimestamp: data.deploymentTimestamp,
          delta: compareDeltaSummary(data.delta),
          suppressed: suppressedNote(data.suppressed),
        }),
      })
    }),
  )

  // --- Version Compare (v1 vs v2 of one process) ---
  server.tool(
    {
      name: "analytics_show_version_compare",
      title: "Process Version Comparison",
      description:
        "Visualize KPI deltas between two deployed versions of the same processDefinitionKey within a shared time window. Results are flagged `suppressed` when either version has fewer than minBucketSize instances.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...schemas.versionCompareInput.shape,
        minBucketSize: optionalMinBucketSize,
      }),
      ...showToolBinding("analytics_show_version_compare", "Process Version Comparison"),
    },
    withToolErrors(async (args, toolCtx) => {
      const t = await localizeFor(profileStore, toolCtx)
      const minBucketSize =
        args.minBucketSize ?? (await settingsFor(profileStore, toolCtx)).minBucketSize
      const data = await queries.versionCompare(ch, { ...args, minBucketSize })
      return buildSingleWidgetView({
        widget: "analytics:version-compare",
        app: "analytics",
        dataType: "analytics:versionCompare",
        data,
        title: "Version Compare",
        summary: t("aSum.versionCompare", {
          key: data.processDefinitionKey,
          versionA: data.versionA,
          versionB: data.versionB,
          windowDays: data.windowDays,
          delta: compareDeltaSummary(data.delta),
          suppressed: suppressedNote(data.suppressed),
        }),
      })
    }),
  )

  // --- Engine Compare (ONE process, engine A vs engine B) ---
  server.tool(
    {
      name: "analytics_show_engine_compare",
      title: "Engine Comparison",
      description:
        "Visualize KPI deltas for ONE process definition as it runs on two CIB Seven engines (e.g. prod-a vs prod-b) over a shared time window. processDefinitionKey is required — engines host different process mixes, so an unscoped engine-vs-engine comparison would measure the mix, not the engines. Results are flagged `suppressed` when either engine has fewer than minBucketSize instances. For the cross-engine picture use analytics_show_engine_landscape.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...schemas.engineCompareInput.shape,
        minBucketSize: optionalMinBucketSize,
      }),
      ...showToolBinding("analytics_show_engine_compare", "Engine Comparison"),
    },
    withToolErrors(async (args, toolCtx) => {
      const t = await localizeFor(profileStore, toolCtx)
      const minBucketSize =
        args.minBucketSize ?? (await settingsFor(profileStore, toolCtx)).minBucketSize
      const data = await queries.engineCompare(ch, { ...args, minBucketSize })
      return buildSingleWidgetView({
        widget: "analytics:engine-compare",
        app: "analytics",
        dataType: "analytics:engineCompare",
        data,
        title: "Engine Compare",
        summary: t("aSum.engineCompare", {
          engineA: data.engineA,
          engineB: data.engineB,
          key: data.processDefinitionKey,
          windowDays: data.windowDays,
          delta: compareDeltaSummary(data.delta),
          suppressed: suppressedNote(data.suppressed),
        }),
      })
    }),
  )

  // --- Engine Landscape (cross-engine overview, NOT an engine ranking) ---
  server.tool(
    {
      name: "analytics_show_engine_landscape",
      title: "Cross-Engine Landscape",
      description:
        "Show the cross-engine process landscape: which process definitions run on which engine, the absolute load per engine (running instances, open incidents, failed jobs) and the engine-owned job backlog. Counts, not rates — engines host different process mixes, so per-engine rates would measure the mix. Highlights the definitions deployed on several engines, the only sound targets for analytics_show_engine_compare.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object(schemas.engineLandscapeInput.shape),
      ...showToolBinding("analytics_show_engine_landscape", "Cross-Engine Landscape"),
    },
    withToolErrors(async (args, toolCtx) => {
      const t = await localizeFor(profileStore, toolCtx)
      const data = await queries.engineLandscape(ch, { engine: args.engine })
      return buildSingleWidgetView({
        widget: "analytics:engine-landscape",
        app: "analytics",
        dataType: "analytics:engineLandscape",
        data,
        title: "Cross-Engine Landscape",
        summary: t("aSum.engineLandscape", {
          engineCount: data.totals.engineCount,
          reportingEngineCount: data.totals.reportingEngineCount,
          processKeyCount: data.totals.processKeyCount,
          sharedProcessKeyCount: data.totals.sharedProcessKeyCount,
          runningInstances: data.totals.runningInstances,
          openIncidents: data.totals.openIncidents,
          shared: data.sharedProcessKeys.length
            ? t("aSum.sharedKeys", { keys: data.sharedProcessKeys.join(", ") })
            : "",
        }),
      })
    }),
  )

  server.tool(
    {
      name: ANALYTICS_ENGINE_LANDSCAPE_DATA,
      title: "Engine landscape data (internal)",
      description:
        "Internal JSON feed (no UI) for the cross-engine landscape widget's self-fetch — also consumed by the camunda7 cockpit's cross-engine mode. Prefer analytics_show_engine_landscape.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object(schemas.engineLandscapeInput.shape),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const data = await queries.engineLandscape(ch, { engine: args.engine })
      return buildDataFeedResult({ ...data })
    }),
  )
}
