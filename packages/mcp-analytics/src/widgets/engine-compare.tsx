import { Badge } from "@miragon/mcp-toolkit-ui"
import type { EngineCompareResult } from "@miragon-ai/client-analytics"
import { useT } from "../messages/use-t.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
  fmtPct,
  fmtPp,
  type ComparisonMetric,
} from "./comparison-shared.js"

export type EngineCompareData = EngineCompareResult | null

const METRICS: Array<{
  labelKey: string
  value: (k: EngineCompareResult["kpis"][number]) => string
  delta: (d: EngineCompareResult["delta"]) => { value: string; worseIfUp: boolean }
}> = [
  {
    labelKey: "aEngineCompare.metricInstances",
    value: (k) => String(k.instance_count),
    delta: (d) => ({ value: fmtPct(d.instance_count_delta_pct), worseIfUp: false }),
  },
  {
    labelKey: "aEngineCompare.metricFailureRate",
    value: (k) => `${k.failure_rate_pct.toFixed(1)}%`,
    delta: (d) => ({ value: fmtPp(d.failure_rate_delta_pp), worseIfUp: true }),
  },
  {
    labelKey: "aEngineCompare.metricIncidentRate",
    value: (k) => `${k.incident_rate_pct.toFixed(1)}%`,
    delta: (d) => ({ value: fmtPp(d.incident_rate_delta_pp), worseIfUp: true }),
  },
  {
    labelKey: "aEngineCompare.metricAvgDuration",
    value: (k) => `${k.avg_duration_sec.toFixed(1)}s`,
    delta: (d) => ({ value: fmtPct(d.avg_duration_delta_pct), worseIfUp: true }),
  },
  {
    labelKey: "aEngineCompare.metricP95Duration",
    value: (k) => `${k.p95_duration_sec.toFixed(1)}s`,
    delta: (d) => ({ value: fmtPct(d.p95_duration_delta_pct), worseIfUp: true }),
  },
]

export function EngineCompareWidget({ data }: { data: EngineCompareData }) {
  const t = useT()
  if (!data) return <ComparisonEmptyState>{t("aEngineCompare.emptyNoData")}</ComparisonEmptyState>

  const a = data.kpis.find((k) => k.bucket === "engineA")
  const b = data.kpis.find((k) => k.bucket === "engineB")
  if (!a || !b) {
    return <ComparisonEmptyState>{t("aEngineCompare.emptyIncomplete")}</ComparisonEmptyState>
  }

  const metrics: ComparisonMetric[] = METRICS.map((m) => ({
    label: t(m.labelKey),
    delta: m.delta(data.delta),
    before: m.value(a),
    after: m.value(b),
  }))

  return (
    <ComparisonCard
      title={t("aEngineCompare.title")}
      tableLabel={t("aEngineCompare.tableLabel")}
      beforeLabel={data.engineA}
      afterLabel={data.engineB}
      metrics={metrics}
      badges={
        <>
          <Badge variant="secondary">
            {data.engineA} ↔ {data.engineB}
          </Badge>
          {data.processDefinitionKey && <Badge>{data.processDefinitionKey}</Badge>}
          <Badge variant="outline">
            {t("aEngineCompare.windowBadge", { days: data.windowDays })}
          </Badge>
          {data.elementId && (
            <Badge variant="outline">
              {t("aEngineCompare.elementBadge", { id: data.elementId })}
            </Badge>
          )}
          {data.suppressed && (
            <Badge variant="destructive">
              {t("aEngineCompare.suppressed", { min: data.minBucketSize })}
            </Badge>
          )}
        </>
      }
    />
  )
}
