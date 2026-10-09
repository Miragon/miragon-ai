import { Badge } from "@miragon/mcp-toolkit-ui"
import type { VersionCompareResult } from "@miragon-ai/analytics-client"
import { AskAiButton } from "@miragon-ai/widget-shell/widgets"
import { useT, type T } from "../messages/use-t.js"
import { versionCompareCaveats, type VersionCompareCaveats } from "../version-compare-caveats.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
  buildComparisonMetrics,
  describeDeltas,
} from "./comparison-shared.js"

export type VersionCompareData = VersionCompareResult | null

/**
 * The caveat under the table: why the incident rates read "n/a" (the incident
 * metric carries no version label, so they are unknown — never 0).
 */
export function versionCompareNote(t: T, caveats: VersionCompareCaveats): string | undefined {
  return caveats.incidentRatesUnavailable ? t("aVersionCompare.incidentKpisUnavailable") : undefined
}

/** The Ask-AI prompt, carrying the same caveat as the on-screen note. */
export function versionCompareAskAiPrompt(
  data: VersionCompareResult,
  caveats: VersionCompareCaveats,
): string {
  const { processDefinitionKey: key, versionA, versionB, windowDays } = data
  const incidentCaveat = caveats.incidentRatesUnavailable
    ? " Incident rates are NOT measured per version (the incident metric carries no process-version label) — treat them as unknown, not as zero."
    : ""
  return `Interpret the version comparison for process ${key}, v${versionA} (baseline) vs v${versionB} (candidate), over a ${windowDays}-day window. The on-screen deltas are: ${describeDeltas(data.delta)}.${incidentCaveat} First call analytics_version_compare(processDefinitionKey="${key}", versionA=${versionA}, versionB=${versionB}, windowDays=${windowDays}) to confirm the numbers and the 'suppressed' flag, then call analytics_element_bottleneck(processDefinitionKey="${key}", period="${windowDays}d") to find which activity drives any duration regression (its incident counts cover every version of the key, not one). Tell me in 3-4 sentences: is v${versionB} a genuine regression or just noise / low sample size, which element is responsible, and the single recommended next action (roll running instances back to v${versionA}, hold the rollout, or accept).`
}

export function VersionCompareWidget({ data }: { data: VersionCompareData }) {
  const t = useT()
  if (!data) return <ComparisonEmptyState>{t("aVersionCompare.emptyNoData")}</ComparisonEmptyState>

  const a = data.kpis.find((k) => k.bucket === "versionA")
  const b = data.kpis.find((k) => k.bucket === "versionB")
  if (!a || !b) {
    return <ComparisonEmptyState>{t("aVersionCompare.emptyIncomplete")}</ComparisonEmptyState>
  }

  const metrics = buildComparisonMetrics(t, a, b, data.delta)
  const caveats = versionCompareCaveats(data)

  return (
    <ComparisonCard
      title={t("aVersionCompare.title")}
      tableLabel={t("aVersionCompare.tableLabel")}
      beforeLabel={`v${data.versionA}`}
      afterLabel={`v${data.versionB}`}
      metrics={metrics}
      note={versionCompareNote(t, caveats)}
      actions={<AskAiButton prompt={versionCompareAskAiPrompt(data, caveats)} variant="primary" />}
      badges={
        <>
          <Badge>{data.processDefinitionKey}</Badge>
          <Badge variant="secondary">
            v{data.versionA} ↔ v{data.versionB}
          </Badge>
          <Badge variant="outline">
            {t("aVersionCompare.badgeWindow", { days: data.windowDays })}
          </Badge>
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
