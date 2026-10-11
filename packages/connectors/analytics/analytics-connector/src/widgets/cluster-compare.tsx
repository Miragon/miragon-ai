import { Badge } from "@miragon/mcp-toolkit-ui"
import { Scale } from "lucide-react"
import type { ClusterCompareResult } from "@miragon-ai/analytics-client"
import {
  AskAiButton,
  ViewMeta,
  formatNumber,
  formatTimestamp,
} from "@miragon-ai/widget-shell/widgets"
import { useT, type T } from "../messages/use-t.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
  SuppressedBadge,
  buildComparisonMetrics,
  deltaFacts,
} from "./comparison-shared.js"
import { engineIdsOf, useHandOff, type HandOff } from "./hand-off.js"
import { enginesMeta } from "./view-meta.js"

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

/**
 * A measured window length in words: whole days and tenths ("7 Tage",
 * "1,5 days"), under a day in hours, so a window cut short at now reads
 * "2 Stunden", not "0,1 Tage".
 */
export function windowLength(t: T, days: number): string {
  if (days < 1) {
    return t("aCommon.hours", { count: formatNumber(Math.max(1, Math.round(days * 24))) })
  }
  return t("aCommon.days", { count: formatNumber(days, { maximumFractionDigits: 1 }) })
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
      suppressed={data.suppressed}
      actions={
        <AskAiButton
          prompt={ask(clusterCompareHandOff(data))}
          icon={Scale}
          label={t("aComparison.askLabel")}
          variant="primary"
        />
      }
      meta={
        <ViewMeta
          period={t("aClusterCompare.period", {
            before: windowLength(t, data.windowDays.before),
            after: windowLength(t, data.windowDays.after),
          })}
          engines={enginesMeta(data.engines)}
          asOf={data.asOf}
        />
      }
      badges={
        <>
          <Badge variant="secondary">
            {t("aClusterCompare.deployBadge", {
              timestamp: formatTimestamp(data.deploymentTimestamp),
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
            <SuppressedBadge>
              {t("aClusterCompare.insufficientSignal", {
                minBucketSize: formatNumber(data.minBucketSize),
              })}
            </SuppressedBadge>
          )}
        </>
      }
    />
  )
}
