import { Badge } from "@miragon/mcp-toolkit-ui"
import type { ClusterCompareResult } from "@miragon-ai/client-analytics"
import {
  ComparisonCard,
  ComparisonEmptyState,
  fmtPct,
  fmtPp,
  type ComparisonMetric,
} from "./comparison-shared.js"

export type ClusterCompareData = ClusterCompareResult | null

const METRICS: Array<{
  label: string
  value: (k: ClusterCompareResult["kpis"][number]) => string
  delta: (d: ClusterCompareResult["delta"]) => { value: string; worseIfUp: boolean }
}> = [
  {
    label: "Instances",
    value: (k) => String(k.instance_count),
    delta: (d) => ({ value: fmtPct(d.instance_count_delta_pct), worseIfUp: false }),
  },
  {
    label: "Failure rate",
    value: (k) => `${k.failure_rate_pct.toFixed(1)}%`,
    delta: (d) => ({ value: fmtPp(d.failure_rate_delta_pp), worseIfUp: true }),
  },
  {
    label: "Incident rate",
    value: (k) => `${k.incident_rate_pct.toFixed(1)}%`,
    delta: (d) => ({ value: fmtPp(d.incident_rate_delta_pp), worseIfUp: true }),
  },
  {
    label: "Avg duration",
    value: (k) => `${k.avg_duration_sec.toFixed(1)}s`,
    delta: (d) => ({ value: fmtPct(d.avg_duration_delta_pct), worseIfUp: true }),
  },
  {
    label: "P95 duration",
    value: (k) => `${k.p95_duration_sec.toFixed(1)}s`,
    delta: (d) => ({ value: fmtPct(d.p95_duration_delta_pct), worseIfUp: true }),
  },
]

export function ClusterCompareWidget({ data }: { data: ClusterCompareData }) {
  if (!data) return <ComparisonEmptyState>No comparison data.</ComparisonEmptyState>

  const before = data.kpis.find((k) => k.period === "before")
  const after = data.kpis.find((k) => k.period === "after")
  if (!before || !after) {
    return <ComparisonEmptyState>Incomplete KPI data.</ComparisonEmptyState>
  }

  const metrics: ComparisonMetric[] = METRICS.map((m) => ({
    label: m.label,
    delta: m.delta(data.delta),
    before: m.value(before),
    after: m.value(after),
  }))

  return (
    <ComparisonCard
      title="Pre/Post deployment"
      tableLabel="Pre/post deployment metric comparison"
      beforeLabel="Before"
      afterLabel="After"
      metrics={metrics}
      badges={
        <>
          <Badge variant="secondary">Deploy: {data.deploymentTimestamp}</Badge>
          <Badge variant="outline">
            -{data.windowDays.before}d / +{data.windowDays.after}d
          </Badge>
          {data.processDefinitionKey && <Badge>{data.processDefinitionKey}</Badge>}
          {data.elementId && <Badge variant="outline">element: {data.elementId}</Badge>}
          {data.suppressed && (
            <Badge variant="destructive">
              Insufficient signal (min {data.minBucketSize} instances/window)
            </Badge>
          )}
        </>
      }
    />
  )
}
