import { Badge } from "@miragon/mcp-toolkit-ui"
import type { ClusterCompareResult } from "@miragon-ai/client-analytics"
import { useT } from "../messages/use-t.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
  fmtPct,
  fmtPp,
  type ComparisonMetric,
} from "./comparison-shared.js"

export type ClusterCompareData = ClusterCompareResult | null

const METRICS: Array<{
  labelKey: string
  value: (k: ClusterCompareResult["kpis"][number]) => string
  delta: (d: ClusterCompareResult["delta"]) => { value: string; worseIfUp: boolean }
}> = [
  {
    labelKey: "metricInstances",
    value: (k) => String(k.instance_count),
    delta: (d) => ({ value: fmtPct(d.instance_count_delta_pct), worseIfUp: false }),
  },
  {
    labelKey: "metricFailureRate",
    value: (k) => `${k.failure_rate_pct.toFixed(1)}%`,
    delta: (d) => ({ value: fmtPp(d.failure_rate_delta_pp), worseIfUp: true }),
  },
  {
    labelKey: "metricIncidentRate",
    value: (k) => `${k.incident_rate_pct.toFixed(1)}%`,
    delta: (d) => ({ value: fmtPp(d.incident_rate_delta_pp), worseIfUp: true }),
  },
  {
    labelKey: "metricAvgDuration",
    value: (k) => `${k.avg_duration_sec.toFixed(1)}s`,
    delta: (d) => ({ value: fmtPct(d.avg_duration_delta_pct), worseIfUp: true }),
  },
  {
    labelKey: "metricP95Duration",
    value: (k) => `${k.p95_duration_sec.toFixed(1)}s`,
    delta: (d) => ({ value: fmtPct(d.p95_duration_delta_pct), worseIfUp: true }),
  },
]

export function ClusterCompareWidget({ data }: { data: ClusterCompareData }) {
  const t = useT()
  if (!data) return <ComparisonEmptyState>{t("aClusterCompare.noData")}</ComparisonEmptyState>

  const before = data.kpis.find((k) => k.period === "before")
  const after = data.kpis.find((k) => k.period === "after")
  if (!before || !after) {
    return <ComparisonEmptyState>{t("aClusterCompare.incompleteData")}</ComparisonEmptyState>
  }

  const metrics: ComparisonMetric[] = METRICS.map((m) => ({
    label: t(`aClusterCompare.${m.labelKey}`),
    delta: m.delta(data.delta),
    before: m.value(before),
    after: m.value(after),
  }))

  return (
    <ComparisonCard
      title={t("aClusterCompare.title")}
      tableLabel={t("aClusterCompare.tableLabel")}
      beforeLabel={t("aClusterCompare.beforeLabel")}
      afterLabel={t("aClusterCompare.afterLabel")}
      metrics={metrics}
      badges={
        <>
          <Badge variant="secondary">
            {t("aClusterCompare.deployBadge", { timestamp: data.deploymentTimestamp })}
          </Badge>
          <Badge variant="outline">
            -{data.windowDays.before}d / +{data.windowDays.after}d
          </Badge>
          {data.processDefinitionKey && <Badge>{data.processDefinitionKey}</Badge>}
          {data.elementId && (
            <Badge variant="outline">
              {t("aClusterCompare.elementBadge", { elementId: data.elementId })}
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
