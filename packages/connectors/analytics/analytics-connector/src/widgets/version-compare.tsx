import { Badge } from "@miragon/mcp-toolkit-ui"
import { Scale } from "lucide-react"
import type { VersionCompareResult } from "@miragon-ai/analytics-client"
import {
  AskAiButton,
  ViewMeta,
  formatLookback,
  formatNumber,
} from "@miragon-ai/widget-shell/widgets"
import { useT, type T } from "../messages/use-t.js"
import { versionCompareCaveats, type VersionCompareCaveats } from "../version-compare-caveats.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
  SuppressedBadge,
  buildComparisonMetrics,
  deltaFacts,
} from "./comparison-shared.js"
import { engineIdsOf, useHandOff, type HandOff } from "./hand-off.js"
import { enginesMeta } from "./view-meta.js"

export type VersionCompareData = VersionCompareResult | null

/**
 * The caveat under the table: why the incident rates read "not measured"
 * (the incident metric carries no version label, so they are unknown —
 * never 0).
 */
export function versionCompareNote(t: T, caveats: VersionCompareCaveats): string | undefined {
  return caveats.incidentRatesUnavailable ? t("aVersionCompare.incidentKpisUnavailable") : undefined
}

/**
 * Interpret a version comparison, carrying the on-screen caveat as a fact:
 * the incident rates are not measured per version (unknown, never 0). The
 * comparison is process-wide — the tool takes no element scope (#336).
 */
export function versionCompareHandOff(
  data: VersionCompareResult,
  caveats: VersionCompareCaveats,
): HandOff {
  return {
    intent: "askAi.versionCompare",
    ids: {
      engine: engineIdsOf(data.engines),
      processDefinitionKey: data.processDefinitionKey,
      versionA: data.versionA,
      versionB: data.versionB,
      windowDays: data.windowDays,
    },
    facts: {
      ...deltaFacts(data.delta, data.suppressed),
      incidentRatesMeasured: caveats.incidentRatesUnavailable ? false : undefined,
    },
    tools: ["analytics_version_compare", "analytics_element_bottleneck"],
  }
}

export function VersionCompareWidget({ data }: { data: VersionCompareData }) {
  const t = useT()
  const { ask } = useHandOff()
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
      suppressed={data.suppressed}
      note={versionCompareNote(t, caveats)}
      actions={
        <AskAiButton
          prompt={ask(versionCompareHandOff(data, caveats))}
          icon={Scale}
          label={t("aComparison.askLabel")}
          variant="primary"
        />
      }
      meta={
        <ViewMeta
          period={formatLookback(`${data.windowDays}d`)}
          engines={enginesMeta(data.engines)}
          asOf={data.asOf}
        />
      }
      badges={
        <>
          <Badge>{data.processDefinitionKey}</Badge>
          <Badge variant="secondary">
            {t("aVersionCompare.versionsBadge", {
              versionA: data.versionA,
              versionB: data.versionB,
            })}
          </Badge>
          {data.suppressed && (
            <SuppressedBadge>
              {t("aVersionCompare.badgeInsufficientSignal", {
                min: formatNumber(data.minBucketSize),
              })}
            </SuppressedBadge>
          )}
        </>
      }
    />
  )
}
