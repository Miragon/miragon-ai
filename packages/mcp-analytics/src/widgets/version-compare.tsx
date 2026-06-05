import { Badge } from "@miragon/mcp-toolkit-ui"
import type { VersionCompareResult } from "@miragon-ai/client-analytics"
import { AskAiButton } from "@miragon-ai/widget-shell/widgets"
import {
  ComparisonCard,
  ComparisonEmptyState,
  fmtPct,
  fmtPp,
  type ComparisonMetric,
} from "./comparison-shared.js"

export type VersionCompareData = VersionCompareResult | null

const METRICS: Array<{
  label: string
  value: (k: VersionCompareResult["kpis"][number]) => string
  delta: (d: VersionCompareResult["delta"]) => { value: string; worseIfUp: boolean }
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

export function VersionCompareWidget({ data }: { data: VersionCompareData }) {
  if (!data) return <ComparisonEmptyState>No version-comparison data.</ComparisonEmptyState>

  const a = data.kpis.find((k) => k.bucket === "versionA")
  const b = data.kpis.find((k) => k.bucket === "versionB")
  if (!a || !b) {
    return <ComparisonEmptyState>Incomplete KPI data.</ComparisonEmptyState>
  }

  const metrics: ComparisonMetric[] = METRICS.map((m) => ({
    label: m.label,
    delta: m.delta(data.delta),
    before: m.value(a),
    after: m.value(b),
  }))

  const elementScope = data.elementId ? `, scoped to BPMN element ${data.elementId}` : ""
  const interpretPrompt = `Interpret the version comparison for process ${data.processDefinitionKey}, v${data.versionA} (baseline) vs v${data.versionB} (candidate), over a ${data.windowDays}-day window${elementScope}. The on-screen deltas are: instances ${data.delta.instance_count_delta_pct}%, failure rate ${data.delta.failure_rate_delta_pp}pp, incident rate ${data.delta.incident_rate_delta_pp}pp, avg duration ${data.delta.avg_duration_delta_pct}%, p95 duration ${data.delta.p95_duration_delta_pct}%. First call analytics_version_compare(processDefinitionKey="${data.processDefinitionKey}", versionA=${data.versionA}, versionB=${data.versionB}, windowDays=${data.windowDays}) to confirm the numbers and the 'suppressed' flag, then call analytics_element_bottleneck(processDefinitionKey="${data.processDefinitionKey}", period="${data.windowDays}d") to find which activity drives any incident-rate or duration regression. Tell me in 3-4 sentences: is v${data.versionB} a genuine regression or just noise / low sample size, which element is responsible, and the single recommended next action (roll running instances back to v${data.versionA}, hold the rollout, or accept).`

  return (
    <ComparisonCard
      title="Version comparison"
      tableLabel="Version metric comparison"
      beforeLabel={`v${data.versionA}`}
      afterLabel={`v${data.versionB}`}
      metrics={metrics}
      actions={<AskAiButton prompt={interpretPrompt} variant="primary" />}
      badges={
        <>
          <Badge>{data.processDefinitionKey}</Badge>
          <Badge variant="secondary">
            v{data.versionA} ↔ v{data.versionB}
          </Badge>
          <Badge variant="outline">window: {data.windowDays}d</Badge>
          {data.elementId && <Badge variant="outline">element: {data.elementId}</Badge>}
          {data.suppressed && (
            <Badge variant="destructive">
              Insufficient signal (min {data.minBucketSize} instances/version)
            </Badge>
          )}
        </>
      }
    />
  )
}
