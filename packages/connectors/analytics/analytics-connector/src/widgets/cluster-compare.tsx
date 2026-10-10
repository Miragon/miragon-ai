import { Badge } from "@miragon/mcp-toolkit-ui"
import type { ClusterCompareResult } from "@miragon-ai/analytics-client"
import { AskAiButton, formatTimestamp } from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
  buildComparisonMetrics,
  deltaFacts,
} from "./comparison-shared.js"
import { engineIdsOf, useHandOff, type HandOff } from "./hand-off.js"

export type ClusterCompareData = ClusterCompareResult | null

/**
 * Interpret a before/after-deployment comparison — confirm it, then find the
 * driving element. The ids re-run the comparison as asked (the requested
 * whole-day windows, the echoed engines); the windows actually measured — cut
 * short at now or the retention — are facts (#336).
 */
export function clusterCompareHandOff(data: ClusterCompareResult): HandOff {
  return {
    intent: "askAi.clusterCompare",
    ids: {
      engine: engineIdsOf(data.engines),
      deploymentTimestamp: data.deploymentTimestamp,
      windowBeforeDays: data.requestedWindowDays.before,
      windowAfterDays: data.requestedWindowDays.after,
      processDefinitionKey: data.processDefinitionKey,
      activityId: data.activityId,
    },
    facts: {
      measuredBeforeDays: data.windowDays.before,
      measuredAfterDays: data.windowDays.after,
      partial: data.partial || undefined,
      ...deltaFacts(data.delta, data.suppressed),
    },
    tools: ["analytics_cluster_compare", "analytics_element_bottleneck"],
  }
}

export function ClusterCompareWidget({ data }: { data: ClusterCompareData }) {
  const t = useT()
  const { ask } = useHandOff()
  if (!data) return <ComparisonEmptyState>{t("aClusterCompare.noData")}</ComparisonEmptyState>

  const before = data.kpis.find((k) => k.period === "before")
  const after = data.kpis.find((k) => k.period === "after")
  if (!before || !after) {
    return <ComparisonEmptyState>{t("aClusterCompare.incompleteData")}</ComparisonEmptyState>
  }

  const metrics = buildComparisonMetrics(t, before, after, data.delta)

  return (
    <ComparisonCard
      title={t("aClusterCompare.title")}
      tableLabel={t("aClusterCompare.tableLabel")}
      beforeLabel={t("aClusterCompare.beforeLabel")}
      afterLabel={t("aClusterCompare.afterLabel")}
      metrics={metrics}
      actions={<AskAiButton prompt={ask(clusterCompareHandOff(data))} variant="primary" />}
      badges={
        <>
          <Badge variant="secondary">
            {t("aClusterCompare.deployBadge", {
              timestamp: formatTimestamp(data.deploymentTimestamp),
            })}
          </Badge>
          <Badge variant="outline">
            {t("aClusterCompare.windowBadge", {
              before: data.windowDays.before,
              after: data.windowDays.after,
            })}
          </Badge>
          {data.partial && <Badge variant="outline">{t("aClusterCompare.partialBadge")}</Badge>}
          {data.processDefinitionKey && <Badge>{data.processDefinitionKey}</Badge>}
          {data.activityId && (
            <Badge variant="outline">
              {t("aClusterCompare.elementBadge", { activityId: data.activityId })}
            </Badge>
          )}
          {data.suppressed && (
            <Badge variant="destructive">
              {t("aClusterCompare.insufficientSignal", { minBucketSize: data.minBucketSize })}
            </Badge>
          )}
        </>
      }
    />
  )
}
