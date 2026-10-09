import { Badge } from "@miragon/mcp-toolkit-ui"
import type { EngineCompareResult } from "@miragon-ai/analytics-client"
import { AskAiButton } from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
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
      actions={<AskAiButton prompt={ask(engineCompareHandOff(data))} variant="primary" />}
      badges={
        <>
          <Badge variant="secondary">
            {data.engineA} ↔ {data.engineB}
          </Badge>
          <Badge>{data.processDefinitionKey}</Badge>
          <Badge variant="outline">
            {t("aEngineCompare.windowBadge", { days: data.windowDays })}
          </Badge>
          {data.activityId && (
            <Badge variant="outline">
              {t("aEngineCompare.elementBadge", { id: data.activityId })}
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
