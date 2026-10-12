import { WidgetShell, formatDuration, formatNumber } from "@miragon-ai/widget-shell/widgets"
import { KpiGrid, KpiGridSkeleton, type KpiCell } from "@miragon/mcp-toolkit-ui"
import { useDashboardSelfFetch, type DashboardScopeProps, type DashboardView } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT, type T } from "../../messages/use-t.js"
import { RATE_UP_IS_WORSE, deltaVerdict, type DeltaVerdict } from "../comparison-shared.js"

/** Incidents per 100 starts, one decimal: "3,4" / "3.4" (no %: a rate may pass 100). */
const rate = (value: number | null) => formatNumber(value, { maximumFractionDigits: 1 })

const VERDICT_KEY: Record<DeltaVerdict, string> = {
  worse: "aComparison.deltaWorse",
  better: "aComparison.deltaBetter",
  notReliable: "aComparison.deltaNotReliable",
}

/**
 * The incident rate judged against the period before (U14/U17): a rate on its
 * own is no verdict, so the cell itself carries no tone. Its trend line names
 * the previous period's rate; only a change from the comparisons' threshold
 * on (1 incident per 100 starts) is "worse" (danger arrow) or "better"
 * (success arrow), a smaller one is flat and neutral, and over fewer starts
 * than the comparison floor it reads "not reliable" without a colour.
 *
 * Only with the process held fixed: over several processes the rate is a
 * total over their mix, so it moves when the mix moves while no process
 * changed, and can even invert the per-process truth (Simpson's paradox, the
 * reason every comparison requires a `processDefinitionKey`). An unscoped
 * dashboard names the previous rate as a plain reference: no verdict, no
 * direction, no colour.
 */
export function incidentRateTrend(
  t: T,
  data: Pick<DashboardView, "incidentRatePct" | "previous" | "processDefinitionKey">,
): Pick<KpiCell, "trend" | "trendDirection" | "trendTone"> {
  const previous = data.previous
  if (!previous || data.incidentRatePct === null) return {}
  if (previous.incidentRatePct === null) return { trend: t("aExecPerf.previousNoStarts") }
  const value = rate(previous.incidentRatePct)
  if (!data.processDefinitionKey) return { trend: t("aExecPerf.previous", { value }) }
  const change = data.incidentRatePct - previous.incidentRatePct
  const verdict = deltaVerdict(change, RATE_UP_IS_WORSE, previous.suppressed)
  if (!verdict) {
    return {
      trend: t("aExecPerf.previous", { value }),
      trendDirection: "flat",
      trendTone: "neutral",
    }
  }
  return {
    trend: t("aExecPerf.previousJudged", { value, verdict: t(VERDICT_KEY[verdict]) }),
    trendDirection: change > 0 ? "up" : change < 0 ? "down" : "flat",
    trendTone: verdict === "worse" ? "danger" : verdict === "better" ? "success" : "neutral",
  }
}

export function ExecutionPerformanceKpi({
  data: initialData,
  processDefinitionKey,
  period,
  engine,
}: { data: DashboardView | null } & DashboardScopeProps) {
  const t = useT()
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period, engine })

  return (
    <QueryGate
      initialData={initialData}
      query={fallbackQuery}
      skeleton={<KpiGridSkeleton cells={4} boxed />}
    >
      {(data) => (
        <WidgetShell>
          <KpiGrid
            boxed
            header={{ label: t("aExecPerf.headerLabel") }}
            cells={[
              { label: t("aExecPerf.avgDuration"), value: formatDuration(data.avgDurationMs) },
              { label: t("aExecPerf.median"), value: formatDuration(data.medianDurationMs) },
              { label: t("aExecPerf.p95"), value: formatDuration(data.p95DurationMs) },
              {
                label: t("aExecPerf.incidentRate"),
                // Incidents per 100 starts: one instance may carry several, so
                // the rate can pass 100 and reads as a number, not a share.
                value: rate(data.incidentRatePct),
                ...incidentRateTrend(t, data),
              },
            ]}
          />
        </WidgetShell>
      )}
    </QueryGate>
  )
}
