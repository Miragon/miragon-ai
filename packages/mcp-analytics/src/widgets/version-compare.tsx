import { Badge } from "@miragon/mcp-toolkit-ui"
import type { VersionCompareResult } from "@miragon-ai/client-analytics"
import { AskAiButton } from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
  buildComparisonMetrics,
  describeDeltas,
} from "./comparison-shared.js"

export type VersionCompareData = VersionCompareResult | null

export function VersionCompareWidget({ data }: { data: VersionCompareData }) {
  const t = useT()
  if (!data) return <ComparisonEmptyState>{t("aVersionCompare.emptyNoData")}</ComparisonEmptyState>

  const a = data.kpis.find((k) => k.bucket === "versionA")
  const b = data.kpis.find((k) => k.bucket === "versionB")
  if (!a || !b) {
    return <ComparisonEmptyState>{t("aVersionCompare.emptyIncomplete")}</ComparisonEmptyState>
  }

  const metrics = buildComparisonMetrics(t, a, b, data.delta)

  const elementScope = data.elementId ? `, scoped to BPMN element ${data.elementId}` : ""
  const interpretPrompt = `Interpret the version comparison for process ${data.processDefinitionKey}, v${data.versionA} (baseline) vs v${data.versionB} (candidate), over a ${data.windowDays}-day window${elementScope}. The on-screen deltas are: ${describeDeltas(data.delta)}. First call analytics_version_compare(processDefinitionKey="${data.processDefinitionKey}", versionA=${data.versionA}, versionB=${data.versionB}, windowDays=${data.windowDays}) to confirm the numbers and the 'suppressed' flag, then call analytics_element_bottleneck(processDefinitionKey="${data.processDefinitionKey}", period="${data.windowDays}d") to find which activity drives any incident-rate or duration regression. Tell me in 3-4 sentences: is v${data.versionB} a genuine regression or just noise / low sample size, which element is responsible, and the single recommended next action (roll running instances back to v${data.versionA}, hold the rollout, or accept).`

  return (
    <ComparisonCard
      title={t("aVersionCompare.title")}
      tableLabel={t("aVersionCompare.tableLabel")}
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
          <Badge variant="outline">
            {t("aVersionCompare.badgeWindow", { days: data.windowDays })}
          </Badge>
          {data.elementId && (
            <Badge variant="outline">
              {t("aVersionCompare.badgeElement", { element: data.elementId })}
            </Badge>
          )}
          {data.suppressed && (
            <Badge variant="destructive">
              {t("aVersionCompare.badgeInsufficientSignal", { min: data.minBucketSize })}
            </Badge>
          )}
        </>
      }
    />
  )
}
