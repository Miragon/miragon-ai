import { Badge } from "@miragon/mcp-toolkit-ui"
import type { ClusterCompareKpi, ClusterCompareResult } from "@miragon-ai/analytics-client"
import {
  HandOffButton,
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

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

type MeasuredWindow = Pick<ClusterCompareKpi, "window_from" | "window_to" | "window_days">

/**
 * A measured window's length in seconds, from its exact bounds. `window_days`
 * is rounded to 0.01 d (about 14 minutes), too coarse for a window cut short
 * at now; it stands in only when the bounds do not parse.
 */
function measuredSeconds(measured: MeasuredWindow) {
  const seconds = (Date.parse(measured.window_to) - Date.parse(measured.window_from)) / 1000
  return Number.isFinite(seconds) ? seconds : measured.window_days * DAY
}

/**
 * A measured window's length in words, in the largest unit it fills: days
 * and tenths ("7 Tage", "1.5 days"), else whole hours, else whole minutes,
 * else "unter 1 Minute". A window cut short at now reads "2 Stunden" or
 * "10 Minuten", never "0,1 Tage" and never a minute window as "1 Stunde".
 */
export function windowLength(t: T, measured: MeasuredWindow): string {
  const seconds = measuredSeconds(measured)
  if (seconds >= DAY) {
    return t("aCommon.days", { count: formatNumber(seconds / DAY, { maximumFractionDigits: 1 }) })
  }
  if (seconds >= HOUR) {
    return t("aCommon.hours", { count: formatNumber(Math.round(seconds / HOUR)) })
  }
  if (seconds >= MINUTE) {
    return t("aCommon.minutes", { count: formatNumber(Math.round(seconds / MINUTE)) })
  }
  return t("aCommon.underOneMinute")
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
        <HandOffButton
          action="assess"
          prompt={ask(clusterCompareHandOff(data))}
          variant="primary"
        />
      }
      meta={
        <ViewMeta
          period={t("aClusterCompare.period", {
            before: windowLength(t, before),
            after: windowLength(t, after),
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
