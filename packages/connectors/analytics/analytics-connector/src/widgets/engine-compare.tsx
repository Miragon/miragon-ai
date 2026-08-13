import { Badge } from "@miragon/mcp-toolkit-ui"
import type { EngineCompareResult } from "@miragon-ai/analytics-client"
import { AskAiButton } from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
  buildComparisonMetrics,
  describeDeltas,
} from "./comparison-shared.js"

export type EngineCompareData = EngineCompareResult | null

export function EngineCompareWidget({ data }: { data: EngineCompareData }) {
  const t = useT()
  if (!data) return <ComparisonEmptyState>{t("aEngineCompare.emptyNoData")}</ComparisonEmptyState>

  const a = data.kpis.find((k) => k.bucket === "engineA")
  const b = data.kpis.find((k) => k.bucket === "engineB")
  if (!a || !b) {
    return <ComparisonEmptyState>{t("aEngineCompare.emptyIncomplete")}</ComparisonEmptyState>
  }

  const metrics = buildComparisonMetrics(t, a, b, data.delta)

  const elementScope = data.elementId ? `, scoped to BPMN element ${data.elementId}` : ""
  // The process is fixed on both sides, so the remaining question is genuinely
  // about the engines — not about which workload each of them happens to run.
  const interpretPrompt = `Interpret the comparison of process "${data.processDefinitionKey}" running on engine ${data.engineA} (baseline) vs ${data.engineB} over a ${data.windowDays}-day window${elementScope}. The on-screen deltas are: ${describeDeltas(data.delta)}. First call analytics_engine_compare(processDefinitionKey="${data.processDefinitionKey}", engineA="${data.engineA}", engineB="${data.engineB}", windowDays=${data.windowDays}) to confirm the numbers and the 'suppressed' flag, then call analytics_engine_health for both engines' live operational snapshot. Since the same process is measured on both engines, a real gap points at the engine or its environment (load, resources, workers, configuration) rather than at a different workload. Tell me in 3-4 sentences: does ${data.engineB} genuinely run this process worse than ${data.engineA} or is the difference noise, which metric drives the gap, and the single recommended next action.`

  return (
    <ComparisonCard
      title={t("aEngineCompare.title")}
      tableLabel={t("aEngineCompare.tableLabel")}
      beforeLabel={data.engineA}
      afterLabel={data.engineB}
      metrics={metrics}
      actions={<AskAiButton prompt={interpretPrompt} variant="primary" />}
      badges={
        <>
          <Badge variant="secondary">
            {data.engineA} ↔ {data.engineB}
          </Badge>
          <Badge>{data.processDefinitionKey}</Badge>
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
