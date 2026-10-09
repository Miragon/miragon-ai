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
 * The caveat under the table: why the rates read "n/a" (the incident metric
 * carries no version label, so they are unknown — never 0), and that an
 * `elementId` the caller passed scoped nothing, so every figure is process-wide.
 */
export function versionCompareNote(t: T, caveats: VersionCompareCaveats): string | undefined {
  const notes = [
    caveats.incidentRatesUnavailable ? t("aVersionCompare.incidentKpisUnavailable") : null,
    caveats.ignoredElementId
      ? t("aVersionCompare.elementIgnored", { element: caveats.ignoredElementId })
      : null,
  ].filter((note) => note !== null)
  return notes.length > 0 ? notes.join(" ") : undefined
}

/** The Ask-AI prompt, carrying the same caveats as the on-screen note. */
export function versionCompareAskAiPrompt(
  data: VersionCompareResult,
  caveats: VersionCompareCaveats,
): string {
  const { processDefinitionKey: key, versionA, versionB, windowDays } = data
  // elementId only ever scoped the incident KPIs — never the whole comparison.
  const elementScope =
    data.elementId && !caveats.ignoredElementId
      ? `, incident KPIs scoped to BPMN element ${data.elementId}`
      : ""
  const incidentCaveat = caveats.incidentRatesUnavailable
    ? " Failure and incident rates are NOT measured per version (the incident metric carries no process-version label) — treat them as unknown, not as zero."
    : ""
  const elementCaveat = caveats.ignoredElementId
    ? ` The elementId ${caveats.ignoredElementId} has no effect here (it only scopes the incident KPIs, which are unavailable per version): every figure covers the whole process, not that element.`
    : ""
  return `Interpret the version comparison for process ${key}, v${versionA} (baseline) vs v${versionB} (candidate), over a ${windowDays}-day window${elementScope}. The on-screen deltas are: ${describeDeltas(data.delta)}.${incidentCaveat}${elementCaveat} First call analytics_version_compare(processDefinitionKey="${key}", versionA=${versionA}, versionB=${versionB}, windowDays=${windowDays}) to confirm the numbers and the 'suppressed' flag, then call analytics_element_bottleneck(processDefinitionKey="${key}", period="${windowDays}d") to find which activity drives any duration regression (its incident counts cover every version of the key, not one). Tell me in 3-4 sentences: is v${versionB} a genuine regression or just noise / low sample size, which element is responsible, and the single recommended next action (roll running instances back to v${versionA}, hold the rollout, or accept).`
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
          {data.elementId && (
            <Badge variant="outline">
              {t(
                caveats.ignoredElementId
                  ? "aVersionCompare.badgeElementIgnored"
                  : "aVersionCompare.badgeElement",
                { element: data.elementId },
              )}
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
