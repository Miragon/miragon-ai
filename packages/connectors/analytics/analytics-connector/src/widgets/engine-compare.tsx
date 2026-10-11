import { Badge } from "@miragon/mcp-toolkit-ui"
import { Scale } from "lucide-react"
import type { EngineCompareResult } from "@miragon-ai/analytics-client"
import {
  AskAiButton,
  ViewMeta,
  formatLookback,
  formatNumber,
} from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
  SuppressedBadge,
  buildComparisonMetrics,
  deltaFacts,
} from "./comparison-shared.js"
import { useHandOff, type HandOff } from "./hand-off.js"

export type EngineCompareData = EngineCompareResult | null

/**
 * Interpret ONE process on two engines. The process is held fixed, so a real
 * gap is the engine's (or its environment's) — confirmed by the comparison,
 * then by each engine's live snapshot.
 */
export function engineCompareHandOff(data: EngineCompareResult): HandOff {
  return {
    intent: "askAi.engineCompare",
    ids: {
      processDefinitionKey: data.processDefinitionKey,
      engineA: data.engineA,
      engineB: data.engineB,
      windowDays: data.windowDays,
      activityId: data.activityId,
    },
    facts: deltaFacts(data.delta, data.suppressed),
    tools: ["analytics_engine_compare", "analytics_engine_health"],
  }
}

export function EngineCompareWidget({ data }: { data: EngineCompareData }) {
  const t = useT()
  const { ask } = useHandOff()
  if (!data) return <ComparisonEmptyState>{t("aEngineCompare.emptyNoData")}</ComparisonEmptyState>

  const a = data.kpis.find((k) => k.bucket === "engineA")
  const b = data.kpis.find((k) => k.bucket === "engineB")
  if (!a || !b) {
    return <ComparisonEmptyState>{t("aEngineCompare.emptyIncomplete")}</ComparisonEmptyState>
  }

  const metrics = buildComparisonMetrics(t, a, b, data.delta)

  return (
    <ComparisonCard
      title={t("aEngineCompare.title")}
      tableLabel={t("aEngineCompare.tableLabel")}
      beforeLabel={data.engineA}
      afterLabel={data.engineB}
      metrics={metrics}
      suppressed={data.suppressed}
      actions={
        <AskAiButton
          prompt={ask(engineCompareHandOff(data))}
          icon={Scale}
          label={t("aComparison.askLabel")}
          variant="primary"
        />
      }
      // The two engines head the columns; the line names the period and when.
      meta={<ViewMeta period={formatLookback(`${data.windowDays}d`)} asOf={data.asOf} />}
      badges={
        <>
          <Badge variant="secondary">
            {t("aEngineCompare.enginesBadge", { engineA: data.engineA, engineB: data.engineB })}
          </Badge>
          <Badge>{data.processDefinitionKey}</Badge>
          {data.activityId && (
            <Badge variant="outline">
              {t("aEngineCompare.elementBadge", { id: data.activityId })}
            </Badge>
          )}
          {data.suppressed && (
            <SuppressedBadge>
              {t("aEngineCompare.suppressed", { min: formatNumber(data.minBucketSize) })}
            </SuppressedBadge>
          )}
        </>
      }
    />
  )
}
