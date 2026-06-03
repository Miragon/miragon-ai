import { Badge } from "@miragon/mcp-toolkit-ui"
import type { EngineCompareResult } from "@miragon-ai/client-analytics"
import {
  ComparisonCard,
  ComparisonEmptyState,
  fmtPct,
  fmtPp,
  type ComparisonMetric,
} from "./comparison-shared.js"

export type EngineCompareData = EngineCompareResult | null

const METRICS: Array<{
  label: string
  value: (k: EngineCompareResult["kpis"][number]) => string
  delta: (d: EngineCompareResult["delta"]) => { value: string; worseIfUp: boolean }
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

export function EngineCompareWidget({ data }: { data: EngineCompareData }) {
  if (!data) return <ComparisonEmptyState>No engine-comparison data.</ComparisonEmptyState>

  const a = data.kpis.find((k) => k.bucket === "engineA")
  const b = data.kpis.find((k) => k.bucket === "engineB")
  if (!a || !b) {
    return <ComparisonEmptyState>Incomplete KPI data.</ComparisonEmptyState>
  }

  const metrics: ComparisonMetric[] = METRICS.map((m) => ({
    label: m.label,
    delta: m.delta(data.delta),
    before: m.value(a),
    after: m.value(b),
  }))

  return (
    <ComparisonCard
      title="Engine comparison"
      tableLabel="Engine metric comparison"
      beforeLabel={data.engineA}
      afterLabel={data.engineB}
      metrics={metrics}
      badges={
        <>
          <Badge variant="secondary">
            {data.engineA} ↔ {data.engineB}
          </Badge>
          {data.processDefinitionKey && <Badge>{data.processDefinitionKey}</Badge>}
          <Badge variant="outline">window: {data.windowDays}d</Badge>
          {data.elementId && <Badge variant="outline">element: {data.elementId}</Badge>}
          {data.suppressed && (
            <Badge variant="destructive">
              Insufficient signal (min {data.minBucketSize} instances/engine)
            </Badge>
          )}
        </>
      }
    />
  )
}
